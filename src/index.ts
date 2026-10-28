import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { identityRouter } from "./routes/identity.js";
import { verifyRouter } from "./routes/verify.js";
import { securityRouter } from "./routes/security.js";
import { toolsRouter } from "./routes/tools.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigin = process.env.ORIGIN || "http://localhost:5173";

// Enable CORS for localhost, local network IPs, and tunnels
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "500kb" }));

// Lightweight in-memory rate limiter for challenge and presentation endpoints
const ipRateBuckets: Map<string, number[]> = new Map();

function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "global";
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const timestamps = (ipRateBuckets.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      res.status(429).json({
        error: "Too many requests. Please slow down.",
        retryAfterMs: windowMs - (now - timestamps[0]),
      });
      return;
    }

    timestamps.push(now);
    ipRateBuckets.set(key, timestamps);
    next();
  };
}

// Redirect root to frontend UI
app.get("/", (_req: Request, res: Response) => {
  res.redirect("http://localhost:5173");
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    app: "VeriPass Digital Passport",
    timestamp: new Date().toISOString(),
    disclaimer: "PROTOTYPE ONLY - DEMO DATA ONLY - NOT FOR REAL PERSONAL DOCUMENTS",
  });
});

// Apply rate limits to verification endpoints
app.use("/api/verify/challenge", rateLimit(30, 60000));
app.use("/api/verify/presentation", rateLimit(30, 60000));

// Mount Routers
app.use("/api/identity", identityRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/security", securityRouter);
app.use("/api/tools", toolsRouter);

// Centralized error handling middleware: logs details securely on server, returns generic message to client
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ServerError]", {
    name: err.name,
    message: err.message,
    timestamp: new Date().toISOString(),
  });

  res.status(500).json({
    error: "An internal server error occurred. Details have been logged securely.",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`  VERIPASS Digital Passport Server`);
    console.log(`  Listening on http://localhost:${port}`);
    console.log(`  CORS Allowed Origin: ${allowedOrigin}`);
    console.log(`  DISCLAIMER: Demo Prototype Only`);
    console.log(`======================================================\n`);
  });
}

export default app;
