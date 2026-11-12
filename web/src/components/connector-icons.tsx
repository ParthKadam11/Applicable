/** Brand marks — accurate silhouettes for connectors + logo strip. */

type IconProps = { className?: string; mono?: boolean };

export function IconCanIApply({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#06203a" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="#00b39a"
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui,sans-serif"
      >
        CA
      </text>
    </svg>
  );
}

/** Anthropic Claude asterisk — official mark geometry */
const CLAUDE_PATH =
  "m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z";

export function IconClaude({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#D97757";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#F5E6DE" /> : null}
      <g transform="translate(4.5 4.5) scale(0.09)">
        <path fill={fill} d={CLAUDE_PATH} />
      </g>
    </svg>
  );
}

/** Cursor cube — official octahedron mark */
const CURSOR_PATH =
  "M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z";

export function IconCursor({ className = "", mono = false }: IconProps) {
  if (mono) {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden>
        <g transform="translate(5.5 3.5) scale(0.045)">
          <path fill="currentColor" d={CURSOR_PATH} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#000" />
      <g transform="translate(5.5 3.5) scale(0.045)">
        <path fill="#fff" d={CURSOR_PATH} />
      </g>
    </svg>
  );
}

/** OpenAI blossom — ChatGPT / Codex mark */
const OPENAI_PATH =
  "M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z";

export function IconChatGPT({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#10a37f";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#e8faf4" /> : null}
      <g transform="translate(4.2 4) scale(0.092)">
        <path fill={fill} d={OPENAI_PATH} />
      </g>
    </svg>
  );
}

/** xAI Grok mark */
const GROK_PATH =
  "M0.58392448,14.9254204 L0.8326,14.66295 C2.004465,13.42985 3.1678,12.2082 2.45814,10.48105 C1.50813,8.1701 2.061355,5.4619 3.820575,3.70057 C5.6495,1.8709 8.3431,1.40957 10.59295,2.336505 C11.0907,2.52161 11.5245,2.785025 11.86295,3.02993 L9.98425,3.89849 C8.235,3.163775 6.23115,3.66355 5.0081,4.88809 C3.354105,6.5426 3.019895,9.4117 4.95835,11.2656 L-0.335,15.99995 C-0.066496,15.62975 0.2538896,15.275934 0.58392448,14.9254204 Z M14.0391,2.288155 L16.33165,0 L16.20795,0.172288 C14.4658,2.574355 13.6153,3.749045 14.29795,6.6879 C14.76445,8.68415 14.261,10.90255 12.63545,12.53005 C10.5861,14.58325 7.3066,15.0403 4.6059,13.19215 L6.48885,12.3193 C8.2125,12.99705 10.0983,12.69945 11.4536,11.34255 C12.80895,9.9856 13.1133,8.00925 12.4321,6.3647 C12.30265,6.05285 11.9144,5.97455 11.64275,6.1753 L6.102,10.27035 L14.0391,2.288155 Z";

export function IconGrok({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#fff";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#0a0a0a" /> : null}
      <g transform="translate(5 5) scale(1.375)">
        <path fill={fill} d={GROK_PATH} />
      </g>
    </svg>
  );
}

/** OpenAI Codex — same blossom, dark tile */
export function IconCodex({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#0d0d0d";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#f0f0f0" /> : null}
      <g transform="translate(4.2 4) scale(0.092)">
        <path fill={fill} d={OPENAI_PATH} />
      </g>
    </svg>
  );
}

/** Windsurf — dual wave */
export function IconWindsurf({ className = "", mono = false }: IconProps) {
  const stroke = mono ? "currentColor" : "#0ea5e9";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      {!mono ? <rect width="32" height="32" rx="8" fill="#e0f2fe" /> : null}
      <path
        d="M7 19.5c2.2-3.8 4.2-5.5 6.5-5.5 1.8 0 3.1 1 4.4 2.6 1.2 1.5 2.5 2.7 4.1 2.7 1.5 0 2.8-.9 4.5-3.3"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7 13c2.2-3.8 4.2-5.5 6.5-5.5 1.8 0 3.1 1 4.4 2.6 1.2 1.5 2.5 2.7 4.1 2.7 1.5 0 2.8-.9 4.5-3.3"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Cline — agent face */
export function IconCline({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#7c3aed";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#f3e8ff" /> : null}
      <path
        fill={fill}
        d="M16 6.5c.7 0 1.3.6 1.3 1.3v1.1h3.2c1.5 0 2.7 1.2 2.7 2.7v9.2c0 1.5-1.2 2.7-2.7 2.7h-8.9c-1.5 0-2.7-1.2-2.7-2.7v-9.2c0-1.5 1.2-2.7 2.7-2.7h3.1V7.8c0-.7.6-1.3 1.3-1.3zm-3.2 8.2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.4 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12.2 19c.9 1.1 2.2 1.8 3.8 1.8s2.9-.7 3.8-1.8H12.2z"
      />
    </svg>
  );
}

/** MCP protocol glyph */
export function IconMcp({ className = "", mono = false }: IconProps) {
  const fill = mono ? "currentColor" : "#06203a";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {!mono ? <rect width="32" height="32" rx="8" fill="#e8f4ff" /> : null}
      <path
        fill={fill}
        d="M10 8.5h4.2v2.2H11.8c-.3 0-.5.2-.5.5v9.6c0 .3.2.5.5.5H14V23H10c-1.4 0-2.5-1.1-2.5-2.5v-9C7.5 9.6 8.6 8.5 10 8.5zm7.8 0H22c1.4 0 2.5 1.1 2.5 2.5v9c0 1.4-1.1 2.5-2.5 2.5h-4.2v-2.2h3.5c.3 0 .5-.2.5-.5v-3.6h-4v-2.2h4V11c0-.3-.2-.5-.5-.5h-3.5V8.5z"
      />
    </svg>
  );
}

export function IconWrench({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="none">
      <path
        d="M10.2 2.2a3.2 3.2 0 0 0-4.3 3.7L2.2 9.6a1.2 1.2 0 0 0 1.7 1.7l3.7-3.7a3.2 3.2 0 0 0 3.7-4.3l-1.6 1.6a1 1 0 1 1-1.4-1.4l1.9-1.3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
