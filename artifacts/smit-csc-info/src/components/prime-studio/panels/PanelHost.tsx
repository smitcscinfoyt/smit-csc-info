/**
 * Slide-out panel that shows the contents of whichever sidebar tab is
 * currently active. Width is fixed (320px) to match Canva. Closes when
 * the user clicks the same icon again.
 */

import { useStudio } from "../store";
import { ElementsPanel } from "./ElementsPanel";
import { TextPanel } from "./TextPanel";
import { ArtboardPanel } from "./ArtboardPanel";
import { UploadsPanel } from "./UploadsPanel";
import { AssetsPanel } from "./AssetsPanel";
import { TemplatesPanel } from "./TemplatesPanel";
import { ToolsPanel } from "./ToolsPanel";
import { LayersPanel } from "./LayersPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { BrandKitPanel } from "./BrandKitPanel";
import { AppsPanel } from "./AppsPanel";

export function PanelHost() {
  const sidebarTab = useStudio((s) => s.sidebarTab);
  if (!sidebarTab) return null;

  return (
    <div
      className="w-80 shrink-0 bg-white border-r border-purple-200 overflow-y-auto"
      data-testid={`panel-${sidebarTab}`}
    >
      {sidebarTab === "elements" && <ElementsPanel />}
      {sidebarTab === "text" && <TextPanel />}
      {sidebarTab === "artboard" && <ArtboardPanel />}
      {sidebarTab === "uploads" && <UploadsPanel />}
      {sidebarTab === "assets" && <AssetsPanel />}
      {sidebarTab === "templates" && <TemplatesPanel />}
      {sidebarTab === "tools" && <ToolsPanel />}
      {sidebarTab === "layers" && <LayersPanel />}
      {sidebarTab === "brand" && <BrandKitPanel />}
      {sidebarTab === "projects" && <ProjectsPanel />}
      {sidebarTab === "apps" && <AppsPanel />}
    </div>
  );
}
