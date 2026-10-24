import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UPDATE_INTERVAL_MS = 20;
const DOUBLE_TAP_WINDOW_MS = 400;
const MODIFIER_KEYS = [
    Clutter.ModifierType.SHIFT_MASK,
    Clutter.ModifierType.MOD1_MASK,
    Clutter.ModifierType.CONTROL_MASK,
];
function getModifierMask(keyName) {
    switch (keyName) {
    case 'shift':
        return Clutter.ModifierType.SHIFT_MASK;
    case 'alt':
        return Clutter.ModifierType.MOD1_MASK;
    case 'ctrl':
        return Clutter.ModifierType.CONTROL_MASK;
    case 'ctrl-shift':
        return Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.SHIFT_MASK;
    default:
        return 0;
    }
}

function encodeTemplate(template, values) {
    return template.replace(/\{(action|mode|x|y)\}/g,
        (_match, key) => encodeURIComponent(String(values[key] ?? '')));
}

export default class SantaraWheelExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._mode = null;
        this._previousModifiers = 0;
        this._lastReleasedModifier = 0;
        this._lastReleaseTime = 0;
        this._pollId = 0;
        this._lastLaunchError = null;
        if (typeof DND.addDragMonitor !== 'function' ||
            typeof DND.removeDragMonitor !== 'function' ||
            !Array.isArray(DND.dragMonitors) ||
            !Main.xdndHandler || typeof Main.xdndHandler.connect !== 'function') {
            log('Santara wheel requires GNOME Shell XDND lifecycle signals and DND drag monitors; this Shell version is unsupported.');
            this._settings = null;
            return;
        }

        this._dragActive = false;
        this._lastX = 0;
        this._lastY = 0;

        this._monitor = {
            dragMotion: event => {
                if (event.source !== Main.xdndHandler)
                    return DND.DragMotionResult.CONTINUE;

                if (!this._dragActive)
                    this._previousModifiers = this._readModifierState();
                this._dragActive = true;
                this._lastX = Math.round(event.x);
                this._lastY = Math.round(event.y);
                this._startPolling();
                this._syncWheel();
                return DND.DragMotionResult.CONTINUE;
            },
        };

        this._xdndSignals = Main.xdndHandler;
        this._beginSignal = this._xdndSignals.connect('drag-begin', () => {
            this._dragActive = true;
            this._previousModifiers = this._readModifierState();
            this._lastReleasedModifier = 0;
            this._lastReleaseTime = 0;
            this._readPointer();
            this._startPolling();
        });
        this._endSignal = this._xdndSignals.connect('drag-end', () => this._finishDrag());
        DND.addDragMonitor(this._monitor);
        this._startPolling();
    }

    disable() {
        this._finishDrag();
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        if (this._monitor)
            DND.removeDragMonitor(this._monitor);
        if (this._xdndSignals) {
            if (this._beginSignal)
                this._xdndSignals.disconnect(this._beginSignal);
            if (this._endSignal)
                this._xdndSignals.disconnect(this._endSignal);
        }

        this._settings = null;
        this._monitor = null;
        this._xdndSignals = null;
    }

    _startPolling() {
        if (this._pollId)
            return;

        this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_MS, () => {
            if (!this._dragActive) {
                this._pollId = 0;
                return GLib.SOURCE_REMOVE;
            }

            this._readPointer();
            this._syncWheel();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _readPointer() {
        try {
            const [x, y] = global.get_pointer();
            this._lastX = Math.round(x);
            this._lastY = Math.round(y);
        } catch (error) {
            log(`Santara wheel could not read pointer coordinates: ${error.message}`);
        }
    }

    _readModifierState() {
        try {
            const pointerState = global.get_pointer()[2];
            if (Number.isInteger(pointerState))
                return pointerState;
        } catch (error) {
            log(`Santara wheel could not read modifier state: ${error.message}`);
        }

        try {
            return Clutter.get_default_backend().get_default_seat()
                .get_pointer().get_modifier_state();
        } catch (error) {
            log(`Santara wheel has no modifier-state fallback: ${error.message}`);
        }
        return 0;
    }

    _activeMode(state) {
        const bindings = [
            ['actions', this._settings.get_string('actions-modifier')],
            ['tools', this._settings.get_string('tools-modifier')],
            ['convert', this._settings.get_string('convert-modifier')],
        ];

        for (const [mode, keyName] of bindings) {
            const mask = getModifierMask(keyName);
            if (mask !== 0 && (state & mask) === mask)
                return mode;
        }
        return null;
    }

    _syncWheel() {
        if (!this._dragActive)
            return;
        const current = this._readModifierState();
        const previous = this._previousModifiers;
        this._previousModifiers = current;
        const now = GLib.get_monotonic_time() / 1000;
        for (const key of MODIFIER_KEYS) {
            if ((previous & key) && !(current & key)) {
                this._lastReleasedModifier = key;
                this._lastReleaseTime = now;
            } else if (!(previous & key) && (current & key)) {
                if (this._lastReleasedModifier === key && now - this._lastReleaseTime <= DOUBLE_TAP_WINDOW_MS) {
                    this._lastReleasedModifier = 0;
                    const nextMode = this._activeMode(current);
                    if (nextMode !== null && nextMode !== this._mode) {
                        this._mode = nextMode;
                        this._invoke('show', nextMode);
                    }
                }
            }
        }
    }

    _invoke(action, mode) {
        const method = this._settings.get_string('launch-method');
        const values = {action, mode, x: this._lastX, y: this._lastY};

        try {
            if (method === 'uri') {
                const uri = encodeTemplate(this._settings.get_string('uri-template'), values);
                Gio.AppInfo.launch_default_for_uri(uri, null);
                this._lastLaunchError = null;
                return;
            }

            const template = encodeTemplate(this._settings.get_string('command-template'), values);
            const [parsed, argv] = GLib.shell_parse_argv(template);
            if (!parsed || argv.length === 0)
                throw new Error('The configured command is empty or invalid.');

            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            this._lastLaunchError = null;
        } catch (error) {
            const message = error.message;
            if (message !== this._lastLaunchError)
                log(`Santara wheel launch failed: ${message}`);
            this._lastLaunchError = message;
        }
    }

    _finishDrag() {
        if (this._mode !== null && this._settings)
            this._invoke('hide', '');
        this._dragActive = false;
        this._mode = null;
        this._previousModifiers = 0;
        this._lastReleasedModifier = 0;
        this._lastReleaseTime = 0;
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
    }
}
