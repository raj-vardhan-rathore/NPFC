import { Types } from "mongoose";

export function asObjectId(value: string) {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
}
