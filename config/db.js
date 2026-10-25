import mongoose from 'mongoose';
import dns from "node:dns";
dns.setServers([
    "8.8.8.8",
    "8.8.4.4"
]);

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
}

export default connectDB;
