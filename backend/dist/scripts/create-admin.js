import { connectDatabase } from "../config/database.js";
import { UserModel, roles } from "../models/User.js";
async function main() {
    const [, , emailArg, passwordArg, nameArg = "NPFC Admin", roleArg = "Admin"] = process.argv;
    const role = roleArg;
    if (!emailArg || !passwordArg) {
        throw new Error("Usage: tsx src/scripts/create-admin.ts <email> <password> [name] [role]");
    }
    if (!roles.includes(role)) {
        throw new Error(`Invalid role "${roleArg}". Allowed roles: ${roles.join(", ")}`);
    }
    await connectDatabase();
    const email = emailArg.toLowerCase().trim();
    const existing = await UserModel.findOne({ email });
    if (existing) {
        existing.name = nameArg;
        existing.password = passwordArg;
        existing.role = role;
        await existing.save();
        console.log(`Admin account updated: ${email}`);
    }
    else {
        await UserModel.create({ email, password: passwordArg, name: nameArg, role });
        console.log(`Admin account created: ${email}`);
    }
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
