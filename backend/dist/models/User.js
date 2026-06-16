import bcrypt from "bcryptjs";
import { Schema, model } from "mongoose";
export const roles = ["Super Admin", "Admin", "Accountant", "Operations", "Operations Manager", "Fleet Manager", "Driver Manager", "Viewer"];
const userSchema = new Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: roles, required: true, default: "Viewer" },
    createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
userSchema.pre("save", async function hashPassword() {
    if (!this.isModified("password"))
        return;
    this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
};
export const UserModel = model("User", userSchema);
