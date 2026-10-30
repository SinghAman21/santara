import OperationWindow, { type OperationWindowProps } from '../common/OperationWindow';
import ConversionDetails from './ConversionDetails';
export default function ConversionWindow(props:OperationWindowProps) {
 const title=props.capability.category==='subtitle'?'Confirm format':['document','epub'].includes(props.capability.category)?'Conversion warning':props.capability.label;
 return <OperationWindow {...props} title={title}>{format=><ConversionDetails capability={props.capability} files={props.files} format={format}/>}</OperationWindow>;
}
