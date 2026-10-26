import { expect, test, type Page } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
async function desktop(page:Page){await page.goto('/');await expect(page.locator('.desktop-file')).toHaveCount(7);await page.locator('[data-wheel-anchor]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await expect(page.locator('[data-continuous-fruit]')).toHaveAttribute('data-docked','true');}
async function select(page:Page,name:string){await page.getByRole('button',{name:`Select ${name}`,exact:true}).click();}
const wheel=(page:Page)=>page.locator('[data-continuous-fruit]');
async function choose(page:Page,name:string){await wheel(page).getByRole('button',{name,exact:true}).click();}
async function result(page:Page){await expect(page.locator('.output-card a')).toBeVisible();return page.locator('.output-card a').evaluate(async a=>{const blob=await fetch((a as HTMLAnchorElement).href).then(r=>r.blob());return {name:(a as HTMLAnchorElement).download,mime:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};});}
async function sampleBytes(page:Page,name:string){await select(page,name);await page.locator('.wheel-tabs').getByRole('button',{name:'Files',exact:true}).click();await choose(page,'Download original');await page.getByRole('button',{name:'Run action',exact:true}).click();return result(page);}
test('one persistent orange survives intermediate cuts, zoom, desktop arrival and reverse scrolling',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('.desktop-file')).toHaveCount(7);
  const states=await page.evaluate(async()=>{
    const original=document.querySelector('.citrus-rind')!,fruit=document.querySelector<SVGSVGElement>('[data-continuous-fruit]')!,story=document.querySelector<HTMLElement>('.orchard-story')!,stage=document.querySelector<HTMLElement>('.orchard-stage')!;
    const end=story.offsetTop+story.offsetHeight-stage.offsetHeight;const slot=document.querySelector('[data-wheel-anchor]')!;const final=slot.getBoundingClientRect().top+scrollY-innerHeight*.2;const records=[];
    for(const y of [0,end*.30+story.offsetTop,end*.38+story.offsetTop,end*.44+story.offsetTop,end*.68+story.offsetTop,end*.94+story.offsetTop,end+120,(end+final)/2,final,0]){
      scrollTo({top:y,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const box=fruit.getBoundingClientRect();records.push({same:document.querySelector('.citrus-rind')===original,count:document.querySelectorAll('.citrus-rind').length,width:box.width,height:box.height,opacity:getComputedStyle(original).opacity,hidden:getComputedStyle(fruit).visibility,cut:fruit.querySelector('[data-skin-mask]')!.getAttribute('width'),docked:fruit.dataset.docked});
    }return records;
  });
  for(const state of states){expect(state.same).toBe(true);expect(state.count).toBe(1);expect(state.width).toBeGreaterThan(100);expect(state.width).toBeCloseTo(state.height,2);expect(state.opacity).toBe('1');expect(state.hidden).toBe('visible');}
  expect(states[0].cut).toBe('400');expect(Number(states[2].cut)).toBeGreaterThan(0);expect(Number(states[2].cut)).toBeLessThan(400);expect(states[3].cut).toBe('0');expect(states[8].docked).toBe('true');expect(states[9].cut).toBe('400');expect(errors).toEqual([]);
});
test('seven valid sample categories are visible; their relevant actions and unavailable engines are honest',async({page})=>{
  await desktop(page);for(const name of ['orchard.png','creative-brief.pdf','field-notes.md','captions.srt','orchard-tone.wav','project.zip','harvest.csv'])await expect(page.getByRole('button',{name:`Select ${name}`,exact:true})).toBeVisible();
  await select(page,'captions.srt');await expect(wheel(page).getByRole('button')).toHaveText(['SRT','VTT','TXT']);
  await select(page,'creative-brief.pdf');await page.locator('.wheel-tabs').getByRole('button',{name:'Tools',exact:true}).click();await expect(wheel(page).getByRole('button')).toHaveText(['Compress','Extract pages','Merge PDFs','Rotate pages','Render page']);await expect(page.locator('.unavailable-action')).toContainText('qpdf or Poppler');await expect(page.locator('.output-card')).toHaveCount(0);
  await select(page,'field-notes.md');await expect(wheel(page).getByRole('button',{name:'DOCX',exact:true})).toBeVisible();await expect(wheel(page).getByRole('button',{name:'Resize',exact:true})).toHaveCount(0);await expect(page.locator('.unavailable-action')).toContainText('Pandoc');
  await select(page,'harvest.csv');await expect(page.getByRole('status')).toContainText('disabled');await page.locator('.wheel-tabs').getByRole('button',{name:'Convert',exact:true}).click();await expect(wheel(page).getByRole('button')).toHaveCount(0);await expect(page.locator('.no-actions')).toContainText('No conversion route');
});
test('all six existing image operations produce genuine decoded outputs and leave the source on the desktop',async({page})=>{
  await desktop(page);
  for(const [name,mime,width,height] of [['WebP','image/webp',640,480],['PNG','image/png',640,480],['JPG','image/jpeg',640,480],['Resize','image/png',320,240],['Rotate','image/png',480,640],['Flip','image/png',640,480]] as const){
    await choose(page,name);await page.getByRole('button',{name:'Run action',exact:true}).click();await expect(page.locator('.output-card')).toContainText(`READY · ${name}`);const output=await result(page);expect(output.mime).toBe(mime);
    const dimensions=await page.evaluate(async bytes=>{const b=await createImageBitmap(new Blob([new Uint8Array(bytes)]));const size={width:b.width,height:b.height};b.close();return size;},output.bytes);expect(dimensions).toEqual({width,height});
  }
  await expect(page.getByRole('button',{name:'Select orchard.png',exact:true})).toBeVisible();await expect(page.locator('.desktop-output')).toContainText('orchard-flip.png');const downloaded=page.waitForEvent('download');await page.getByRole('link',{name:'Download result',exact:true}).click();expect((await downloaded).suggestedFilename()).toBe('orchard-flip.png');
});
test('subtitle conversion preserves real timing and plain text removes markup',async({page})=>{
  await desktop(page);await select(page,'captions.srt');await choose(page,'VTT');await page.getByRole('button',{name:'Run action',exact:true}).click();const vtt=await result(page);const text=Buffer.from(vtt.bytes).toString();expect(text).toContain('WEBVTT\n\n00:00:01.000 --> 00:00:02.500');expect(text).toContain('Your files stay with you.');
  await choose(page,'TXT');await page.getByRole('button',{name:'Run action',exact:true}).click();const plain=Buffer.from((await result(page)).bytes).toString();expect(plain).toBe('A fresh perspective.\n\nYour files stay with you.\n');
  await page.locator('input[type=file]').setInputFiles({name:'bad.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:03,000 --> 00:00:01,000\nWrong order')});await choose(page,'VTT');await page.getByRole('button',{name:'Run action',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ends before it starts');await expect(page.locator('.output-card')).toHaveCount(0);
});
test('ZIP and GZIP downloads contain exact original bytes; PDF, audio and archive fixtures are real files',async({page})=>{
  await desktop(page);const pdf=await sampleBytes(page,'creative-brief.pdf');expect(Buffer.from(pdf.bytes).toString()).toContain('%PDF-1.4');expect(Buffer.from(pdf.bytes).toString()).toContain('xref');
  const wav=await sampleBytes(page,'orchard-tone.wav');expect(Buffer.from(wav.bytes).toString('ascii',0,4)).toBe('RIFF');expect(Buffer.from(wav.bytes).toString('ascii',8,12)).toBe('WAVE');
  const archive=await sampleBytes(page,'project.zip');expect(Buffer.from(archive.bytes).readUInt32LE(0)).toBe(0x04034b50);
  const source=await sampleBytes(page,'field-notes.md');await choose(page,'Create ZIP');await page.getByRole('button',{name:'Run action',exact:true}).click();const zipped=Buffer.from((await result(page)).bytes);expect(zipped.readUInt32LE(0)).toBe(0x04034b50);const offset=30+zipped.readUInt16LE(26)+zipped.readUInt16LE(28);expect(zipped.subarray(offset,offset+zipped.readUInt32LE(18))).toEqual(Buffer.from(source.bytes));expect(zipped.toString()).toContain('field-notes.md');
  await choose(page,'Create GZIP');await page.getByRole('button',{name:'Run action',exact:true}).click();expect(gunzipSync(Buffer.from((await result(page)).bytes))).toEqual(Buffer.from(source.bytes));
});
test('real pointer drag follows the cursor, same-key modifier opens a contextual wheel, and a slice receives the file',async({page})=>{
  await desktop(page);const source=await page.getByRole('button',{name:'Select orchard.png',exact:true}).boundingBox();await page.mouse.move(source!.x+source!.width/2,source!.y+source!.height/2);await page.mouse.down();await page.mouse.move(source!.x+source!.width/2+20,source!.y+source!.height/2+12,{steps:3});await expect(page.locator('.drag-file-ghost')).toBeVisible();await page.keyboard.press('Shift');await page.keyboard.press('Shift');await expect(page.locator('.wheel-tabs').getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');await expect(wheel(page).getByRole('button')).toHaveCount(3);
  const box=await wheel(page).boundingBox();await page.mouse.move(box!.x+box!.width*.25,box!.y+box!.height*.35,{steps:10});await expect(page.locator('.is-over-wheel')).toBeVisible();await page.mouse.up();await expect(wheel(page).getByRole('button',{name:'WebP',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.drag-file-ghost')).toHaveCount(0);await page.getByRole('button',{name:'Run action',exact:true}).click();expect((await result(page)).mime).toBe('image/webp');await expect(page.locator('.desktop-file')).toHaveCount(7);
});
test('mixed, repeated and slow modifier presses do not activate; typing is ignored',async({page})=>{
  await desktop(page);const explore=page.locator('.wheel-tabs').getByRole('button',{name:'Explore',exact:true});await explore.focus();await page.keyboard.press('Shift');await page.keyboard.press('Alt');await expect(explore).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await page.keyboard.down('Shift');await page.keyboard.down('Shift');await expect(explore).toHaveAttribute('aria-pressed','true');await page.keyboard.up('Shift');await page.keyboard.press('Escape');await page.keyboard.press('Shift');await page.waitForTimeout(450);await page.keyboard.press('Shift');await expect(explore).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');await page.keyboard.down('Control');await page.keyboard.press('Shift');await page.keyboard.press('Shift');await page.keyboard.up('Control');await expect(page.locator('.wheel-tabs').getByRole('button',{name:'Tools',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>{const input=document.createElement('textarea');input.setAttribute('aria-label','Typing fixture');document.querySelector('.workspace-desk')!.append(input);input.focus();});await page.keyboard.press('Control');await page.keyboard.press('Control');await expect(page.locator('.wheel-tabs').getByRole('button',{name:'Tools',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.wheel-tabs').getByRole('button',{name:'Tools',exact:true}).focus();await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');await page.keyboard.press('Control');await expect(page.locator('.wheel-tabs').getByRole('button',{name:'Tools',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('imports and external drops inspect real file contents, reject disguised images, and can reset the desktop',async({page})=>{
  await desktop(page);await page.locator('input[type=file]').setInputFiles([{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('A real imported note.')},{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('not an image')}]);await expect(page.locator('.desktop-file')).toHaveCount(8);await expect(page.getByRole('status')).toContainText('signature');
  await page.locator('.workspace-desk').evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nDropped cue\n'],'dropped.vtt',{type:'text/vtt'}));el.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:data}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));});await expect(page.getByRole('button',{name:'Select dropped.vtt',exact:true})).toBeVisible();await expect(wheel(page).getByRole('button',{name:'SRT',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear desktop',exact:true}).click();await expect(page.locator('.desktop-file')).toHaveCount(0);await page.getByRole('button',{name:'Restore samples',exact:true}).click();await expect(page.locator('.desktop-file')).toHaveCount(7);
});
test('mobile taps, reduced motion, keyboard wheel navigation and existing routes remain functional',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await desktop(page);await select(page,'captions.srt');await choose(page,'VTT');await page.getByRole('button',{name:'Run action',exact:true}).click();expect(Buffer.from((await result(page)).bytes).toString()).toContain('WEBVTT');await expect(page.locator('.gesture-steps li')).toHaveCount(4);await page.getByRole('button',{name:'Replay gesture demonstration'}).click();
  await select(page,'orchard.png');await wheel(page).getByRole('button',{name:'PNG',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(wheel(page).getByRole('button',{name:'JPG',exact:true})).toBeFocused();
  for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){await page.setViewportSize(size);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);}
  await page.getByRole('link',{name:'See all tools',exact:true}).click();await expect(page).toHaveURL(/\/tools$/);await expect(page.getByRole('heading',{name:'Try the thought process.'})).toBeVisible();for(const route of ['/usecase','/pricing','/install']){await page.goto(route);await expect(page.locator('h1')).toBeVisible();}
});

test('fast scrolling and resizing preserve the single circular fruit and stop cinematic motion after docking',async({page})=>{
  await desktop(page);
  for(const size of [{width:390,height:844},{width:768,height:1024},{width:844,height:390},{width:1440,height:900}]){
    await page.setViewportSize(size);
    const snapshots=await page.evaluate(async()=>{
      const story=document.querySelector<HTMLElement>('.orchard-story')!,stage=document.querySelector<HTMLElement>('.orchard-stage')!,fruit=document.querySelector('[data-continuous-fruit]')!;
      const result=[];
      for(const p of [.38,.97,.1,.98]){scrollTo({top:story.offsetTop+(story.offsetHeight-stage.offsetHeight)*p,behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const box=fruit.getBoundingClientRect();result.push({width:box.width,height:box.height,count:document.querySelectorAll('.citrus-rind').length});}return result;
    });
    for(const s of snapshots){expect(s.count).toBe(1);expect(s.width).toBeGreaterThan(100);expect(s.width).toBeCloseTo(s.height,2);}expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
  }
  await page.locator('[data-wheel-anchor]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await expect(wheel(page)).toHaveAttribute('data-docked','true');
  await select(page,'captions.srt');await choose(page,'VTT');await page.getByRole('button',{name:'Run action',exact:true}).click();await result(page);await page.evaluate(()=>scrollBy({top:20,behavior:'instant'}));await expect(wheel(page)).toHaveAttribute('data-docked','true');
});

test('dragging a different sample updates the wheel before drop and shows an honest empty tool mode',async({page})=>{
  await desktop(page);await expect(wheel(page).getByRole('button',{name:'Resize',exact:true})).toBeVisible();
  const source=await page.getByRole('button',{name:'Select captions.srt',exact:true}).boundingBox();await page.mouse.move(source!.x+source!.width/2,source!.y+source!.height/2);await page.mouse.down();await page.mouse.move(source!.x+source!.width/2+18,source!.y+source!.height/2+12,{steps:3});
  await expect(page.locator('.wheel-current')).toContainText('captions.srt');await expect(wheel(page).getByRole('button',{name:'VTT',exact:true})).toBeVisible();await expect(wheel(page).getByRole('button',{name:'Resize',exact:true})).toHaveCount(0);
  await page.keyboard.press('Alt');await page.keyboard.press('Alt');await expect(wheel(page).getByRole('button')).toHaveCount(0);await expect(page.locator('.no-actions')).toContainText('No editing route');
  await page.keyboard.press('Shift');await page.keyboard.press('Shift');await expect(wheel(page).getByRole('button')).toHaveCount(3);const box=await wheel(page).boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2,{steps:6});await page.mouse.up();await expect(page.locator('.desktop-file')).toHaveCount(7);await expect(page.locator('.output-card')).toHaveCount(0);
});

test('clearing during sample preparation does not repopulate a deliberately cleared desktop',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){setTimeout(()=>original.call(this,callback,type,quality),700);};});
  await page.goto('/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Clear desktop',exact:true}).click();await page.waitForTimeout(950);await expect(page.locator('.desktop-file')).toHaveCount(0);await page.getByRole('button',{name:'Restore samples',exact:true}).click();await expect(page.locator('.desktop-file')).toHaveCount(7);
});

test('full-motion phone arrival settles above the file tray without blocking sample selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('.desktop-file')).toHaveCount(7);await page.getByRole('link',{name:'TRY REAL FILES'}).click();await page.waitForTimeout(1000);
  const boxes=await page.evaluate(()=>({fruit:document.querySelector('[data-continuous-fruit]')!.getBoundingClientRect().toJSON(),files:document.querySelector('.desktop-files')!.getBoundingClientRect().toJSON()}));expect(boxes.fruit.bottom).toBeLessThanOrEqual(boxes.files.top);
  await page.getByRole('link',{name:'Choose a file below'}).click();await select(page,'captions.srt');await page.getByRole('link',{name:'Choose an action'}).click();await choose(page,'VTT');await page.getByRole('button',{name:'Run action',exact:true}).click();expect(Buffer.from((await result(page)).bytes).toString()).toContain('WEBVTT');
});
