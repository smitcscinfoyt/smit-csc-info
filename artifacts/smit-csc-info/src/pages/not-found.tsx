import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, Home } from "lucide-react";
import { motion } from "framer-motion";
import { useIsPrime } from "@/hooks/use-prime";

export default function NotFound() {
  const isPrime = useIsPrime();

  return (
    <div
      className={`min-h-screen w-full flex items-center justify-center p-4 ${
        isPrime
          ? "bg-gradient-to-br from-purple-950 via-purple-900 to-amber-900"
          : "bg-gray-50"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-md rounded-2xl p-8 text-center shadow-2xl ${
          isPrime
            ? "bg-white/95 backdrop-blur border border-amber-300/40"
            : "bg-white"
        }`}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
          className="flex justify-center mb-4"
        >
          <div
            className={`h-16 w-16 rounded-full flex items-center justify-center ${
              isPrime ? "bg-amber-100" : "bg-red-50"
            }`}
          >
            <AlertTriangle
              className={`h-8 w-8 ${isPrime ? "text-amber-600" : "text-red-500"}`}
            />
          </div>
        </motion.div>
        <h1 className={`text-2xl font-bold mb-2 ${isPrime ? "text-purple-950" : "text-gray-900"}`}>
          Page not found
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          The page you're looking for doesn't exist. Please return to the Home page.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex-1">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = "/")}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Go Back
            </Button>
          </motion.div>
          <Link href="/" className="flex-1">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                className={`w-full ${
                  isPrime
                    ? "bg-gradient-to-r from-amber-400 to-yellow-600 hover:from-amber-500 hover:to-yellow-700 text-purple-950 font-semibold border-0"
                    : ""
                }`}
              >
                <Home className="h-4 w-4 mr-1.5" /> Home
              </Button>
            </motion.div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
