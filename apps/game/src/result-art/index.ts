export { ResultPlate } from './ResultPlate';
export type { ResultPlateProps } from './ResultPlate';
export { resultPlateSource } from './resultPlateAssets';
export {
  NEW_RECORD_STAMP_ROTATION_DEG,
  RESULT_PLATE_SPECS,
  resultPlateDensityBucket,
} from './resultPlateSpec';
export type { ResultPlateKind, ResultPlateSpec } from './resultPlateSpec';
export {
  VICTORY_POSE_ART_STATUS,
  VICTORY_POSE_SLOT_ID,
  isApprovedResultMotionPose,
  resolveResultBotPose,
} from './resultPoseSlot';
export type {
  ApprovedResultBotPose,
  ResolvedResultBotPose,
  ResultBotPoseKind,
} from './resultPoseSlot';
/** @deprecated Use ApprovedResultBotPose */
export type { ApprovedResultBotPose as ApprovedDefeatPose } from './resultPoseSlot';
export { ResultDefeatPose } from './ResultDefeatPose';
export type { ResultDefeatPoseProps } from './ResultDefeatPose';
export { ResultVictoryPose, ResultVictoryPoseSlot } from './ResultVictoryPoseSlot';
export type { ResultVictoryPoseProps, ResultVictoryPoseSlotProps } from './ResultVictoryPoseSlot';
