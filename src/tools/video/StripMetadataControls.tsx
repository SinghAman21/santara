import type { Preview } from './media';
type Props = {
    preview: Preview | null;
    previewError: string;
};
export default function StripMetadataControls({ preview, previewError }: Props) { return <><p className="video-tool-note">Review locally detected stream details, then save a new copy with copied metadata and chapters removed. Encoder-generated tags may remain.</p><div className="video-tool-metadata">{preview?.metadata ? Object.entries(preview.metadata).map(([key, value]) => <div key={key}><span>{key}</span><b>{String(value)}</b></div>) : <span>{previewError || 'Metadata details are unavailable until the preview is inspected.'}</span>}</div></>; }
