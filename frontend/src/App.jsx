import { useCallback, useEffect, useState } from "react";
import AdminConsole from "./components/AdminConsole";
import ChatInterface from "./components/ChatInterface";
import GlobalHeader, { FONT_LEVELS } from "./components/GlobalHeader";
import { fetchCategories, fetchGroups } from "./lib/api";

export default function App() {
  const [activeTab, setActiveTab] = useState("chat");
  const [fontScaleIndex, setFontScaleIndex] = useState(() => {
    const saved = Number(localStorage.getItem("ovec_guru_font_scale_idx"));
    return Number.isInteger(saved) && saved >= 0 && saved < FONT_LEVELS.length ? saved : 1;
  });

  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);

  useEffect(() => {
    const percent = FONT_LEVELS[fontScaleIndex] ?? 100;
    document.documentElement.style.fontSize = `${percent}%`;
    localStorage.setItem("ovec_guru_font_scale_idx", String(fontScaleIndex));
  }, [fontScaleIndex]);

  const loadTaxonomy = useCallback(async () => {
    try {
      const [grps, cats] = await Promise.all([fetchGroups(), fetchCategories()]);
      setGroups(Array.isArray(grps) ? grps : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch {
      // Keep last known state if API temporarily unavailable
    } finally {
      setTaxonomyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTaxonomy();
  }, [loadTaxonomy, activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-ovec-cream text-stone-800">
      <GlobalHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        fontScaleIndex={fontScaleIndex}
        onDecreaseFont={() => setFontScaleIndex((idx) => Math.max(0, idx - 1))}
        onIncreaseFont={() =>
          setFontScaleIndex((idx) => Math.min(FONT_LEVELS.length - 1, idx + 1))
        }
      />

      <main className="flex-1 flex flex-col">
        {activeTab === "chat" ? (
          <ChatInterface
            categories={categories}
            categoriesLoading={taxonomyLoading}
          />
        ) : (
          <AdminConsole
            groups={groups}
            categories={categories}
            onTaxonomyChanged={loadTaxonomy}
          />
        )}
      </main>
    </div>
  );
}
