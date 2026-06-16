import { UserModel } from "../models/User.js";
const DEFAULT_ADMIN = {
    name: "NPFC Admin",
    email: "admin@npfc.com",
    password: "Admin@123",
    role: "Admin"
};
export async function bootstrapDefaultAdmin() {
    const existingUsers = await UserModel.estimatedDocumentCount();
    if (existingUsers > 0)
        return;
    await UserModel.create(DEFAULT_ADMIN);
    console.log("Default admin user created");
}
