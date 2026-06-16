export const customers = [
    {
        id: "c1",
        name: "Tata Consumer Products",
        gstNumber: "27AAACT4050C1ZP",
        contactPerson: "Amit Deshmukh",
        address: "Mumbai, Maharashtra",
        email: "logistics@tataconsumer.example",
        phone: "+91 98765 12001",
        locations: [
            { id: "c1-l1", name: "Indore Plant", address: "Sector 3, Pithampur Road, Indore, Madhya Pradesh", createdDate: "2026-01-12" },
            { id: "c1-l2", name: "Mumbai Distribution Center", address: "Bhiwandi Logistics Park, Thane, Maharashtra", createdDate: "2026-02-04" }
        ]
    },
    {
        id: "c2",
        name: "Reliance Retail",
        gstNumber: "27AABCR1718E1Z4",
        contactPerson: "Neha Shah",
        address: "Navi Mumbai, Maharashtra",
        email: "dispatch@relianceretail.example",
        phone: "+91 98765 12002",
        locations: [
            { id: "c2-l1", name: "Pithampur Warehouse", address: "Plot 42, Pithampur Industrial Area, Dhar, Madhya Pradesh", createdDate: "2026-01-22" },
            { id: "c2-l2", name: "Hyderabad DC", address: "Medchal Logistics Hub, Hyderabad, Telangana", createdDate: "2026-03-09" }
        ]
    },
    {
        id: "c3",
        name: "Mahindra Logistics",
        gstNumber: "29AAFCM2530H1ZD",
        contactPerson: "Prakash Nair",
        address: "Bengaluru, Karnataka",
        email: "accounts@mahindralogistics.example",
        phone: "+91 98765 12003",
        locations: [
            { id: "c3-l1", name: "Dewas Unit", address: "Industrial Area No. 3, Dewas, Madhya Pradesh", createdDate: "2026-02-14" },
            { id: "c3-l2", name: "Ahmedabad Hub", address: "Sanand GIDC, Ahmedabad, Gujarat", createdDate: "2026-02-28" }
        ]
    }
];
export const vehicles = [
    { id: "v1", number: "MH 12 NP 4581", type: "32 FT MXL", ownerName: "NPFC Logistics", status: "In Transit", insuranceExpiry: "2026-07-14", permitExpiry: "2026-06-28", fitnessExpiry: "2026-09-18", pucExpiry: "2026-06-18", serviceDue: "2026-06-20" },
    { id: "v2", number: "MH 14 NP 7782", type: "Container 20 FT", ownerName: "NPFC Logistics", status: "Assigned", insuranceExpiry: "2026-08-02", permitExpiry: "2026-07-05", fitnessExpiry: "2026-11-22", pucExpiry: "2026-07-01", serviceDue: "2026-06-12" },
    { id: "v3", number: "GJ 05 NP 9193", type: "Trailer", ownerName: "NPFC Logistics", status: "Available", insuranceExpiry: "2026-12-01", permitExpiry: "2026-10-16", fitnessExpiry: "2027-01-08", pucExpiry: "2026-08-12", serviceDue: "2026-07-22" },
    { id: "v4", number: "KA 01 NP 3844", type: "Open Body", ownerName: "NPFC Logistics", status: "Maintenance", insuranceExpiry: "2026-06-19", permitExpiry: "2026-06-30", fitnessExpiry: "2026-08-30", pucExpiry: "2026-06-10", serviceDue: "2026-06-08" }
];
export const drivers = [
    { id: "d1", name: "Suresh Patil", mobile: "+91 90000 11101", licenseNumber: "MH12202600091", licenseExpiry: "2027-02-14", address: "Pune, Maharashtra", status: "On Trip" },
    { id: "d2", name: "Imran Shaikh", mobile: "+91 90000 11102", licenseNumber: "MH14202600333", licenseExpiry: "2026-12-07", address: "Nashik, Maharashtra", status: "Assigned" },
    { id: "d3", name: "Ravi Sharma", mobile: "+91 90000 11103", licenseNumber: "GJ05202600981", licenseExpiry: "2028-03-19", address: "Surat, Gujarat", status: "Available" }
];
export const trips = [
    {
        id: "t1", tripNumber: "TRIP-2026-00041", tripDate: "2026-06-06", customerId: "c1",
        consignorName: "Tata Consumer Pune DC", consignorAddress: "Chakan, Pune", consignorGst: "27AAACT4050C1ZP",
        consigneeName: "Tata Consumer NCR Hub", consigneeAddress: "Faridabad, Haryana", consigneeGst: "06AAACT4050C1ZF",
        vehicleId: "v1", driverId: "d1", loadingPoint: "Pune", unloadingPoint: "Delhi", loadingLatLng: [18.5204, 73.8567], unloadingLatLng: [28.7041, 77.1025],
        distanceKm: 1420, freightAmount: 128000, advance: 22000, dieselExpense: 42000, tollExpense: 11200, loadingExpense: 3500, unloadingExpense: 4200, otherExpense: 2800,
        remarks: "High priority FMCG load", status: "In Transit"
    },
    {
        id: "t2", tripNumber: "TRIP-2026-00040", tripDate: "2026-06-05", customerId: "c2",
        consignorName: "Reliance Bhiwandi", consignorAddress: "Bhiwandi, Thane", consignorGst: "27AABCR1718E1Z4",
        consigneeName: "Reliance Hyderabad", consigneeAddress: "Medchal, Hyderabad", consigneeGst: "36AABCR1718E1Z2",
        vehicleId: "v2", driverId: "d2", loadingPoint: "Mumbai", unloadingPoint: "Hyderabad", loadingLatLng: [19.076, 72.8777], unloadingLatLng: [17.385, 78.4867],
        distanceKm: 710, freightAmount: 76000, advance: 15000, dieselExpense: 23500, tollExpense: 6400, loadingExpense: 2500, unloadingExpense: 2500, otherExpense: 1800,
        remarks: "Appointment delivery slot confirmed", status: "Loading"
    },
    {
        id: "t3", tripNumber: "TRIP-2026-00039", tripDate: "2026-06-03", customerId: "c3",
        consignorName: "Mahindra Logistics Bengaluru", consignorAddress: "Hoskote, Bengaluru", consignorGst: "29AAFCM2530H1ZD",
        consigneeName: "Mahindra Logistics Ahmedabad", consigneeAddress: "Sanand, Ahmedabad", consigneeGst: "24AAFCM2530H1ZK",
        vehicleId: "v3", driverId: "d3", loadingPoint: "Bengaluru", unloadingPoint: "Ahmedabad", loadingLatLng: [12.9716, 77.5946], unloadingLatLng: [23.0225, 72.5714],
        distanceKm: 1490, freightAmount: 136000, advance: 26000, dieselExpense: 45500, tollExpense: 12600, loadingExpense: 4100, unloadingExpense: 3900, otherExpense: 2200,
        remarks: "POD received and verified", status: "Completed"
    }
];
export const invoices = [
    { id: "i1", invoiceNumber: "NPFC/2026/000001", tripId: "t3", customerId: "c3", invoiceDate: "2026-06-04", dueDate: "2026-06-19", amount: 136000, outstandingAmount: 86000, status: "Partial", emailRecipient: "accounts@mahindralogistics.example", emailDate: "2026-06-04", emailStatus: "Sent" },
    { id: "i2", invoiceNumber: "NPFC/2026/000002", tripId: "t2", customerId: "c2", invoiceDate: "2026-06-05", dueDate: "2026-06-20", amount: 76000, outstandingAmount: 76000, status: "Pending", emailRecipient: "dispatch@relianceretail.example", emailDate: "2026-06-05", emailStatus: "Sent" }
];
export const payments = [
    { id: "p1", invoiceId: "i1", customerId: "c3", amount: 50000, paymentDate: "2026-06-05", referenceNumber: "UTR893212", mode: "NEFT", remarks: "Part payment", allocations: [{ invoiceId: "i1", amount: 50000 }] }
];
export const expenses = trips.flatMap((trip) => [
    { id: `${trip.id}-diesel`, tripId: trip.id, type: "Diesel", amount: trip.dieselExpense, expenseDate: trip.tripDate, remarks: "Trip diesel" },
    { id: `${trip.id}-toll`, tripId: trip.id, type: "Toll", amount: trip.tollExpense, expenseDate: trip.tripDate, remarks: "FASTag/toll" }
]);
