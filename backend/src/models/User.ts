import bcrypt from "bcryptjs";
import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const roles = ["Super Admin", "Admin", "Accountant", "Operations", "Operations Manager", "Fleet Manager", "Driver Manager", "Viewer"] as const;
export type UserRole = typeof roles[number];

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true, default: "Viewer" },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

type User = InferSchemaType<typeof userSchema>;

export type UserDocument = HydratedDocument<User> & {
  comparePassword(candidate: string): Promise<boolean>;
};

export const UserModel = model<User>("User", userSchema);
