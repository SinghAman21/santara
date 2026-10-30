import ArchiveOptions from './ArchiveOptions';
import OperationWindow, { type OperationWindowProps } from '../../common/OperationWindow';
import CreateArchive from './CreateArchive';
import Extract from './Extract';
export default function ArchiveWindow(props:OperationWindowProps) {
 const operation=props.capability.operation || props.capability.id.split(':').pop();
 return <OperationWindow {...props} title={operation==='extract'?'Extract':'Create archive'}>{(format,values,onChange)=><><ArchiveOptions operation={operation || ''} format={format} files={props.files} values={values} onChange={onChange}/>{operation==='create-archive'?<CreateArchive/>:<Extract/>}</>}</OperationWindow>;
}
