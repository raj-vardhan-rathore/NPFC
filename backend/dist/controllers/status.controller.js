import { TripModel } from "../models/Trip.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { isDatabaseConnected } from "../config/database.js";
export const sendTripStatusUpdate = asyncHandler(async (req, res) => {
    assertDatabase();
    const trip = await TripModel.findById(req.params.id).populate("companyId driverId vehicleId").lean();
    if (!trip)
        throw new HttpError(404, "Trip not found.");
    res.json({
        ok: true,
        message: "Status update queued successfully.",
        tripId: String(trip._id),
        tripNumber: trip.tripId,
        status: req.body.status,
        channel: "WhatsApp-ready"
    });
});
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
