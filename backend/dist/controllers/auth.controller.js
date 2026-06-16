import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
export const login = asyncHandler(async (req, res) => {
    const identifier = (req.body.email || req.body.username || "").toLowerCase();
    const password = req.body.password;
    const user = await UserModel.findOne({ email: identifier }).select("+password");
    if (!user || !(await user.comparePassword(password)))
        throw new HttpError(401, "Invalid credentials.");
    const token = signToken(String(user._id), user.email, user.role, user.name);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});
export const createUser = asyncHandler(async (req, res) => {
    const user = await UserModel.create(req.body);
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt });
});
export const listUsers = asyncHandler(async (_req, res) => {
    res.json(await UserModel.find().select("-password").sort({ createdAt: -1 }));
});
function signToken(id, email, role, name) {
    return jwt.sign({ sub: id, email, role, name }, env.jwtSecret, { expiresIn: "8h" });
}
