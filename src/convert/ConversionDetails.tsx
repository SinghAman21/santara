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
export default function ConversionDetails({capability,files}: {capability:Capability;files:LocalFile[]}) {
 const category = files.some(file=>file.ext==='epub') ? 'epub' : capability.category;
 const Review=reviews[category];
 return Review ? <Review/> : null;
}
