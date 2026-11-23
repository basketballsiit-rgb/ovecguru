/**
 * Lightweight zero-dependency Markdown renderer tailored for clean, scannable Thai answers.
 * Renders headings, **bold**, bullet lists (- / *), and numbered lists without raw asterisks.
 */

function renderInline(text) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(
        <strong key={key++} className="font-semibold text-stone-950">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.9em] font-mono text-ovec-dark"
        >
          {match[2]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function FormattedAnswer({ content, streaming = false }) {
  if (!content) return null;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listType = null; // 'ul' | 'ol'
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    if (listType === "ol") {
      blocks.push(
        <ol
          key={`list-${blocks.length}`}
          className="space-y-1.5 pl-5 list-decimal marker:font-semibold marker:text-ovec-maroon"
        >
          {listItems.map((item, idx) => (
            <li key={idx} className="pl-1 leading-relaxed text-stone-800">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="space-y-1.5">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 leading-relaxed text-stone-800">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ovec-maroon shrink-0" />
              <span className="flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    listItems = [];
    listType = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings (### / ## / #)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flushList();
      blocks.push(
        <h4
          key={`h-${blocks.length}`}
          className="text-base font-bold text-ovec-dark pt-1.5 border-b border-stone-100 pb-1"
        >
          {renderInline(headingMatch[1])}
        </h4>
      );
      continue;
    }

    // Unordered list (- item or * item or • item)
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list (1. item or 1) item)
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed text-stone-800">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();

  return (
    <div className="space-y-2.5 text-base">
      {blocks}
      {streaming && (
        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-ovec-maroon opacity-75 rounded-sm" />
      )}
    </div>
  );
}
