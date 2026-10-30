import OperationWindow, { type OperationWindowProps } from '../common/OperationWindow';
import ConversionDetails from './ConversionDetails';
export default function ConversionWindow(props:OperationWindowProps) {
 return <OperationWindow {...props}><ConversionDetails capability={props.capability} files={props.files}/></OperationWindow>;
}
