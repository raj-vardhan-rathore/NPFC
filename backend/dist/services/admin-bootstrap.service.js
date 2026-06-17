import { UserModel } from "../models/User.js";
const DEFAULT_ADMIN = {
    name: "NPFC Admin",
    email: "npfc@admin.com",
    password: "Rajk@1974",
    role: "Admin"
};
export async function bootstrapDefaultAdmin() {
    const admin = await UserModel.findOne({ email: DEFAULT_ADMIN.email }).select("+password");
    if (admin) {
        if (!(await admin.comparePassword(DEFAULT_ADMIN.password)) || admin.role !== DEFAULT_ADMIN.role || admin.name !== DEFAULT_ADMIN.name) {
            admin.name = DEFAULT_ADMIN.name;
            admin.password = DEFAULT_ADMIN.password;
            admin.role = DEFAULT_ADMIN.role;
            await admin.save();
            console.log("NPFC admin user synchronized");
        }
        return;
    }
    await UserModel.create(DEFAULT_ADMIN);
    console.log("NPFC admin user created");
}
