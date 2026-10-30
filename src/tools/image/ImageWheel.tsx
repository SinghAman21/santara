import ReferenceWheel from '../../common/ReferenceWheel';
import type { RadialWheelProps } from '../../common/RadialWheel';
export { referenceSlicePath as imageSlicePath } from '../../common/ReferenceWheel';
export default function ImageWheel(props:RadialWheelProps) { return <ReferenceWheel {...props} family="image"/>; }
