// Import this FIRST. ES module imports are hoisted, so env must be loaded in its own module
// before any other file reads process.env.
import 'dotenv/config';

process.env.TZ = process.env.TZ || 'Asia/Karachi'; // all "today" and "09:15" logic uses this timezone
