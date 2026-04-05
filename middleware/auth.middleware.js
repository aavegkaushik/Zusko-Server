import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
  const authHeader = req.header("Authorization");

if (!authHeader) {
  return res.status(401).json({ message: "No token" });
}

const token = authHeader.startsWith("Bearer ")
  ? authHeader.split(" ")[1]
  : authHeader;


  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};