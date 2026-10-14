import dotenv from "dotenv";
import connectDB from "./config/database.js";
import app from "./app.js";

dotenv.config({
    path:"./.env"
});

const startServer = async () => {
    try {
        await connectDB();

        const port = process.env.PORT || 8000;

        const server = app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });

        server.on("error", (err) => {
            console.error("Server error:", err);
        });

    } catch (error) {
        console.log("Error starting the server:", error);
    }
}


startServer();