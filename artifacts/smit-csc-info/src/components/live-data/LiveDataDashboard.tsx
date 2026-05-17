import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sprout, Cloud, Waves } from "lucide-react";
import { MandiPanel } from "./MandiPanel";
import { WeatherPanel } from "./WeatherPanel";
import { WaterPanel } from "./WaterPanel";

/**
 * Live Data Dashboard hub. Three sub-tabs, each a self-contained panel
 * that owns its own filters, fetching and rendering. Mounted inside the
 * top-level "Live Data" tab on /documents.
 */
export function LiveDataDashboard() {
  return (
    <Tabs defaultValue="mandi" className="w-full">
      <TabsList className="flex flex-wrap gap-2 bg-transparent p-0 h-auto mb-5 justify-start">
        <TabsTrigger
          value="mandi"
          data-testid="live-tab-mandi"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-700 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-md"
        >
          <Sprout className="h-4 w-4" /> Mandi
        </TabsTrigger>
        <TabsTrigger
          value="weather"
          data-testid="live-tab-weather"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-700 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-md"
        >
          <Cloud className="h-4 w-4" /> Weather
        </TabsTrigger>
        <TabsTrigger
          value="water"
          data-testid="live-tab-water"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-700 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-md"
        >
          <Waves className="h-4 w-4" /> Water
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mandi">
        <MandiPanel />
      </TabsContent>
      <TabsContent value="weather">
        <WeatherPanel />
      </TabsContent>
      <TabsContent value="water">
        <WaterPanel />
      </TabsContent>
    </Tabs>
  );
}
