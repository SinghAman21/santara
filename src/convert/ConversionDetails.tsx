import ImageReview from './image/Convert';
import VideoReview from './video/Convert';
import AudioReview from './audio/Convert';
import PdfReview from './pdf/Export';
import ArchiveReview from './archive/Create';
import DocumentReview from './document/ConversionWarning';
import EpubReview from './epub/ConversionWarning';
import PresentationReview from './presentation/ExportPdf';
import SpreadsheetReview from './spreadsheet/ExportText';
import SubtitleReview from './subtitle/ConfirmFormat';
import type { ComponentType } from 'react';
import type { Capability, LocalFile } from '../common/types';
const reviews: Record<string,ComponentType> = {
 image: ImageReview,
 video: VideoReview,
 audio: AudioReview,
 pdf: PdfReview,
 archive: ArchiveReview,
 document: DocumentReview,
 epub: EpubReview,
 presentation: PresentationReview,
 spreadsheet: SpreadsheetReview,
 subtitle: SubtitleReview,
};
export default function ConversionDetails({capability,files,format}: {capability:Capability;files:LocalFile[];format?:string}) {
 const category = files.some(file=>file.ext==='epub') ? 'epub' : capability.category;
 const Review=reviews[category];
 return Review ? <>{format&&<dl className="conversion-facts"><div><dt>Route</dt><dd>{files[0]?.ext.toUpperCase()} → {format.toUpperCase()}</dd></div>{category==='subtitle'&&<div><dt>Timing</dt><dd>{format==='txt'?'Omitted in text export':'Preserved for valid SRT/VTT cues'}</dd></div>}{category==='epub'&&<div><dt>Navigation &amp; layout</dt><dd>May reflow · review the saved copy</dd></div>}</dl>}<Review/></> : null;
}
