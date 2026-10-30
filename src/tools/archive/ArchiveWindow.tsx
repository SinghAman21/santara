import OperationWindow, { type OperationWindowProps } from '../../common/OperationWindow';
import CreateArchive from './CreateArchive';
import Extract from './Extract';
export default function ArchiveWindow(props:OperationWindowProps) {
 const operation=props.capability.operation || props.capability.id.split(':').pop();
 return <OperationWindow {...props}>{operation==='create-archive'?<CreateArchive/>:<Extract/>}</OperationWindow>;
}
