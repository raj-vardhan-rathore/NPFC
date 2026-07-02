import mongoose from "mongoose";
import { env } from "../config/env.js";
import { TripModel } from "../models/Trip.js";

async function run() {
  if (!env.mongodbUri) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(env.mongodbUri);
  const cursor = TripModel.find({ $or: [{ destinations: { $exists: false } }, { destinations: { $size: 0 } }] }).cursor();
  let migrated = 0;
  for await (const trip of cursor) {
    trip.destinations = [{
      consignorId: trip.companyId, consigneeId: trip.companyId,
      loadingLocation: trip.source, unloadingLocation: trip.destination,
      material: trip.material || "Material / Goods", weightMt: trip.weightMt || 0,
      ratePerMt: trip.ratePerMt || 0, freightAmount: trip.freightAmount,
      payeeId: trip.companyId
    }] as any;
    await trip.save();
    migrated += 1;
  }
  await TripModel.syncIndexes();
  console.log(`Migrated ${migrated} trips and synchronized indexes.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
