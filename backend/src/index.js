import app from "../../app.js";

const port = process.env.PORT || 8000;
const server = app.listen(port, () => console.log(`Server running on port ${port}`));
server.on("error", (error) => {
    console.error("Server failed to start:", error.message);
    process.exitCode = 1;
});
