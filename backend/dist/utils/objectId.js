import { Types } from "mongoose";
export function asObjectId(value) {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
}
