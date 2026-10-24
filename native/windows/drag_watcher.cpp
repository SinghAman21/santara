#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr UINT WatcherEventMessage = WM_APP + 0x51;
constexpr ULONGLONG DoubleTapWindowMs = 400;

enum Modifier : unsigned int {
    Shift = 1u << 0,
    Alt = 1u << 1,
    Control = 1u << 2,
};

struct Event {
    const char* type;
    std::string mode;
    int x;
    int y;
};

class DragState {
public:
    DragState(int dragWidth, int dragHeight, std::string shiftMode,
              std::string altMode, std::string controlMode, std::string controlShiftMode)
        : thresholdX_(std::max(1, dragWidth / 2)),
          thresholdY_(std::max(1, dragHeight / 2)),
          shiftMode_(std::move(shiftMode)), altMode_(std::move(altMode)),
          controlMode_(std::move(controlMode)), controlShiftMode_(std::move(controlShiftMode)) {}

    void begin(int x, int y, unsigned int modifiers) {
        leftDown_ = true;
        startX_ = x;
        startY_ = y;
        dragging_ = false;
        visible_ = false;
        mode_.clear();
        lastReleased_ = 0;
        lastReleaseTick_ = 0;
        pressedDuringDrag_ = 0;
        (void)modifiers;
    }

    std::vector<Event> move(int x, int y, unsigned int modifiers) {
        if (!leftDown_) return {};
        if (!dragging_ && (std::abs(x - startX_) >= thresholdX_ ||
                           std::abs(y - startY_) >= thresholdY_)) {
            dragging_ = true;
        }
        (void)modifiers;
        return moveVisible(x, y);
    }

    std::vector<Event> modifierDown(int x, int y, unsigned int key, unsigned int modifiers, ULONGLONG tick) {
        if (!leftDown_ || !dragging_ || key == 0) return {};
        pressedDuringDrag_ |= key;
        pressedAt_[key == Shift ? 0 : key == Alt ? 1 : 2] = tick;
        if (key != lastReleased_ ||
            tick < lastReleaseTick_ || tick - lastReleaseTick_ > DoubleTapWindowMs) return {};
        lastReleased_ = 0;
        const char* selected = modeFor(modifiers);
        if (*selected == '\0') return {};
        mode_ = selected;
        visible_ = true;
        lastX_ = x;
        lastY_ = y;
        return {{"show", mode_, x, y}};
    }

    void modifierUp(unsigned int key, ULONGLONG tick) {
        if (!leftDown_ || !dragging_ || key == 0) return;
        const auto pressedAt = pressedAt_[key == Shift ? 0 : key == Alt ? 1 : 2];
        const bool completeTap = (pressedDuringDrag_ & key) != 0 && tick >= pressedAt &&
                                 tick - pressedAt <= DoubleTapWindowMs;
        pressedDuringDrag_ &= ~key;
        if (completeTap) {
            lastReleased_ = key;
            lastReleaseTick_ = tick;
        } else {
            lastReleased_ = 0;
        }
    }

    std::vector<Event> release(int x, int y) {
        auto events = hideIfVisible(x, y);
        leftDown_ = false;
        dragging_ = false;
        mode_.clear();
        lastReleased_ = 0;
        lastReleaseTick_ = 0;
        pressedDuringDrag_ = 0;
        return events;
    }

private:
    int thresholdX_;
    int thresholdY_;
    int startX_ = 0;
    int startY_ = 0;
    int lastX_ = 0;
    int lastY_ = 0;
    bool leftDown_ = false;
    bool dragging_ = false;
    bool visible_ = false;
    std::string mode_;
    std::string shiftMode_;
    std::string altMode_;
    std::string controlMode_;
    std::string controlShiftMode_;
    unsigned int lastReleased_ = 0;
    ULONGLONG lastReleaseTick_ = 0;
    unsigned int pressedDuringDrag_ = 0;
    std::array<ULONGLONG, 3> pressedAt_{};

    const char* modeFor(unsigned int modifiers) const {
        const std::string* selected = nullptr;
        if ((modifiers & (Control | Shift)) == (Control | Shift) && controlShiftMode_ != "none")
            selected = &controlShiftMode_;
        else if ((modifiers & Shift) != 0) selected = &shiftMode_;
        else if ((modifiers & Alt) != 0) selected = &altMode_;
        else if ((modifiers & Control) != 0) selected = &controlMode_;
        if (selected && *selected != "none") return selected->c_str();
        return "";
    }

    std::vector<Event> hideIfVisible(int x, int y) {
        if (!visible_) return {};
        visible_ = false;
        lastX_ = x;
        lastY_ = y;
        return {{"hide", mode_.c_str(), x, y}};
    }

    std::vector<Event> moveVisible(int x, int y) {
        if (!leftDown_ || !dragging_ || !visible_) return {};
        if (x != lastX_ || y != lastY_) {
            lastX_ = x;
            lastY_ = y;
            return {{"move", mode_.c_str(), x, y}};
        }
        return {};
    }
};

struct Config {
    std::string shiftMode = "convert";
    std::string altMode = "tools";
    std::string controlMode = "actions";
    std::string controlShiftMode = "none";
};

HHOOK mouseHook = nullptr;
HHOOK keyboardHook = nullptr;
DWORD hookThreadId = 0;
unsigned int modifiersDown = 0;
std::array<bool, 256> downKeys{};
bool leftButtonDown = false;
Config config;
DragState* dragState = nullptr;

void emit(const Event& event) {
    std::printf("{\"type\":\"%s\",\"mode\":\"%s\",\"x\":%d,\"y\":%d}\n",
                event.type, event.mode.c_str(), event.x, event.y);
    std::fflush(stdout);
}

void emitAll(const std::vector<Event>& events) {
    for (const auto& event : events) {
        auto* queued = new (std::nothrow) Event(event);
        if (queued == nullptr ||
            !PostThreadMessageW(hookThreadId, WatcherEventMessage, 0,
                                reinterpret_cast<LPARAM>(queued))) {
            delete queued;
        }
    }
}

unsigned int modifierForKey(DWORD key) {
    switch (key) {
        case VK_SHIFT:
        case VK_LSHIFT:
        case VK_RSHIFT:
            return Shift;
        case VK_MENU:
        case VK_LMENU:
        case VK_RMENU:
            return Alt;
        case VK_CONTROL:
        case VK_LCONTROL:
        case VK_RCONTROL:
            return Control;
        default:
            return 0;
    }
}

unsigned int currentModifiers() {
    unsigned int result = 0;
    for (std::size_t key = 0; key < downKeys.size(); ++key) {
        if (downKeys[key]) result |= modifierForKey(static_cast<DWORD>(key));
    }
    return result;
}

LRESULT CALLBACK mouseProc(int code, WPARAM message, LPARAM data) {
    if (code == HC_ACTION && dragState != nullptr) {
        const auto* info = reinterpret_cast<const MSLLHOOKSTRUCT*>(data);
        if ((info->flags & LLMHF_INJECTED) == 0) {
            const int x = info->pt.x;
            const int y = info->pt.y;
            if (message == WM_LBUTTONDOWN) {
                leftButtonDown = true;
                dragState->begin(x, y, modifiersDown);
            } else if (message == WM_MOUSEMOVE && leftButtonDown) {
                emitAll(dragState->move(x, y, modifiersDown));
            } else if (message == WM_LBUTTONUP && leftButtonDown) {
                emitAll(dragState->release(x, y));
                leftButtonDown = false;
            }
        }
    }
    return CallNextHookEx(mouseHook, code, message, data);
}

LRESULT CALLBACK keyboardProc(int code, WPARAM message, LPARAM data) {
    if (code == HC_ACTION && dragState != nullptr &&
        (message == WM_KEYDOWN || message == WM_SYSKEYDOWN ||
         message == WM_KEYUP || message == WM_SYSKEYUP)) {
        const auto* info = reinterpret_cast<const KBDLLHOOKSTRUCT*>(data);
        if ((info->flags & LLKHF_INJECTED) == 0) {
            if (info->vkCode < downKeys.size() && modifierForKey(info->vkCode) != 0) {
                const bool pressed = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
                const bool wasPressed = downKeys[info->vkCode];
                if (pressed == wasPressed) return CallNextHookEx(keyboardHook, code, message, data);
                downKeys[info->vkCode] = pressed;
                modifiersDown = currentModifiers();
                if (leftButtonDown) {
                    const auto key = modifierForKey(info->vkCode);
                    const auto tick = GetTickCount64();
                    if (pressed) {
                        POINT cursor{};
                        if (GetCursorPos(&cursor))
                            emitAll(dragState->modifierDown(cursor.x, cursor.y, key, modifiersDown, tick));
                    } else {
                        dragState->modifierUp(key, tick);
                    }
                }
            }
        }
    }
    return CallNextHookEx(keyboardHook, code, message, data);
}

BOOL WINAPI consoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT ||
        signal == CTRL_CLOSE_EVENT || signal == CTRL_SHUTDOWN_EVENT) {
        PostThreadMessageW(hookThreadId, WM_QUIT, 0, 0);
        return TRUE;
    }
    return FALSE;
}

bool validMode(const char* value) {
    return std::strcmp(value, "convert") == 0 ||
           std::strcmp(value, "tools") == 0 ||
           std::strcmp(value, "actions") == 0 ||
           std::strcmp(value, "none") == 0;
}

bool parseArguments(int argc, char** argv, bool* selfTest) {
    for (int index = 1; index < argc; ++index) {
        if (std::strcmp(argv[index], "--help") == 0) {
            std::puts("Usage: santara-drag-watcher.exe [--shift-mode MODE] [--alt-mode MODE] [--control-mode MODE] [--ctrl-shift-mode MODE] [--self-test]; MODE=convert|tools|actions|none");
            return false;
        }
        if (std::strcmp(argv[index], "--self-test") == 0) {
            *selfTest = true;
            continue;
        }
        if (index + 1 >= argc) return false;
        const char* key = argv[index];
        const char* value = argv[++index];
        if (!validMode(value)) return false;
        if (std::strcmp(key, "--shift-mode") == 0) config.shiftMode = value;
        else if (std::strcmp(key, "--alt-mode") == 0) config.altMode = value;
        else if (std::strcmp(key, "--control-mode") == 0) config.controlMode = value;
        else if (std::strcmp(key, "--ctrl-shift-mode") == 0) config.controlShiftMode = value;
        else return false;
    }
    return true;
}

bool runSelfTest() {
    for (const auto key : {Shift, Alt, Control}) {
        DragState held(8, 8, "convert", "tools", "actions", "none");
        held.begin(0, 0, key);
        held.move(4, 0, key);
        held.modifierUp(key, 100);
        if (!held.modifierDown(4, 0, key, key, 150).empty()) return false;
        held.modifierUp(key, 200);
        if (held.modifierDown(4, 0, key, key, 250).size() != 1) return false;
        DragState longPress(8, 8, "convert", "tools", "actions", "none");
        longPress.begin(0, 0, 0);
        longPress.move(4, 0, 0);
        longPress.modifierDown(4, 0, key, key, 100);
        longPress.modifierUp(key, 600);
        if (!longPress.modifierDown(4, 0, key, key, 650).empty()) return false;
    }
    DragState state(8, 8, "convert", "tools", "actions", "none");
    state.begin(100, 100, 0);
    if (!state.move(102, 102, Shift).empty()) return false;
    auto events = state.move(104, 100, Shift);
    if (!events.empty()) return false;
    if (!state.modifierDown(104, 100, Shift, Shift, 100).empty()) return false;
    state.modifierUp(Shift, 150);
    events = state.modifierDown(104, 100, Shift, Shift, 300);
    if (events.size() != 1 || std::strcmp(events[0].type, "show") != 0 || events[0].mode != "convert") return false;
    events = state.move(108, 100, Shift);
    if (events.size() != 1 || std::strcmp(events[0].type, "move") != 0) return false;
    state.modifierUp(Shift, 350);
    if (!state.modifierDown(108, 100, Alt, Alt, 500).empty()) return false;
    state.modifierUp(Alt, 550);
    events = state.modifierDown(108, 100, Alt, Alt, 700);
    if (events.size() != 1 || events[0].mode != "tools") return false;
    events = state.move(112, 104, 0);
    if (events.size() != 1 || std::strcmp(events[0].type, "move") != 0 ||
        events[0].mode != "tools") return false;
    state.modifierUp(Alt, 750);
    if (!state.modifierDown(112, 104, Control, Control, 1200).empty()) return false;
    state.modifierUp(Control, 1250);
    events = state.modifierDown(112, 104, Control, Control, 1700);
    if (!events.empty()) return false;
    state.modifierUp(Control, 1750);
    events = state.modifierDown(112, 104, Control, Control, 1850);
    if (events.size() != 1 || events[0].mode != "actions") return false;
    events = state.release(120, 100);
    if (events.size() != 1 || std::strcmp(events[0].type, "hide") != 0) return false;
    state.begin(200, 200, 0);
    state.move(205, 200, Control);
    events = state.release(205, 200);
    if (!events.empty()) return false;
    DragState custom(8, 8, "convert", "none", "actions", "tools");
    custom.begin(0, 0, 0);
    if (!custom.move(4, 0, Control | Shift).empty()) return false;
    custom.modifierDown(4, 0, Shift, Control | Shift, 100);
    custom.modifierUp(Shift, 150);
    events = custom.modifierDown(4, 0, Shift, Control | Shift, 250);
    return events.size() == 1 && events[0].mode == "tools";
}

} // namespace

int main(int argc, char** argv) {
    bool selfTest = false;
    if (!parseArguments(argc, argv, &selfTest)) return 2;
    if (selfTest) {
        if (!runSelfTest()) {
            std::fprintf(stderr, "drag watcher state self-test failed\n");
            return 1;
        }
        std::puts("drag watcher state self-test passed");
        return 0;
    }

    const int dragWidth = std::max(1, GetSystemMetrics(SM_CXDRAG));
    const int dragHeight = std::max(1, GetSystemMetrics(SM_CYDRAG));
    DragState state(dragWidth, dragHeight, config.shiftMode,
                    config.altMode, config.controlMode, config.controlShiftMode);
    dragState = &state;
    downKeys[VK_SHIFT] = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
    downKeys[VK_MENU] = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
    downKeys[VK_CONTROL] = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
    modifiersDown = currentModifiers();

    MSG initialMessage{};
    PeekMessageW(&initialMessage, nullptr, WM_USER, WM_USER, PM_NOREMOVE);
    hookThreadId = GetCurrentThreadId();
    if (!SetConsoleCtrlHandler(consoleHandler, TRUE)) {
        std::fprintf(stderr, "failed to install console cleanup handler\n");
        return 1;
    }

    mouseHook = SetWindowsHookExW(WH_MOUSE_LL, mouseProc, GetModuleHandleW(nullptr), 0);
    if (mouseHook == nullptr) {
        std::fprintf(stderr, "failed to install low-level mouse hook (%lu)\n", GetLastError());
        SetConsoleCtrlHandler(consoleHandler, FALSE);
        return 1;
    }
    keyboardHook = SetWindowsHookExW(WH_KEYBOARD_LL, keyboardProc, GetModuleHandleW(nullptr), 0);
    if (keyboardHook == nullptr) {
        const DWORD error = GetLastError();
        UnhookWindowsHookEx(mouseHook);
        mouseHook = nullptr;
        SetConsoleCtrlHandler(consoleHandler, FALSE);
        std::fprintf(stderr, "failed to install low-level keyboard hook (%lu)\n", error);
        return 1;
    }

    std::fprintf(stderr, "Santara drag watcher prototype running; Ctrl+C to stop.\n");
    MSG message{};
    BOOL messageResult = 0;
    while ((messageResult = GetMessageW(&message, nullptr, 0, 0)) > 0) {
        if (message.message == WatcherEventMessage) {
            std::unique_ptr<Event> event(reinterpret_cast<Event*>(message.lParam));
            if (event) emit(*event);
            continue;
        }
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    if (keyboardHook != nullptr) UnhookWindowsHookEx(keyboardHook);
    if (mouseHook != nullptr) UnhookWindowsHookEx(mouseHook);
    keyboardHook = nullptr;
    mouseHook = nullptr;
    dragState = nullptr;
    SetConsoleCtrlHandler(consoleHandler, FALSE);
    return messageResult == -1 ? 1 : 0;
}
