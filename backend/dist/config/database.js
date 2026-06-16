import mongoose from "mongoose";
import { env, hasMongo } from "./env.js";
export async function connectDatabase() {
    if (!hasMongo) {
        console.warn("MONGODB_URI is not set. API will use seed data for read-only compatibility.");
        return;
    }
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.mongodbUri, {
        autoIndex: env.nodeEnv !== "production"
    });
    console.log("MongoDB Atlas connected.");
}
export function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}
