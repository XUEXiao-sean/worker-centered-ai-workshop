(() => {
  const main = document.querySelector("main");
  const layer = document.querySelector(".member-markers");
  const status = document.querySelector("#member-status");
  const markers = [...document.querySelectorAll(".member-marker")];
  if (!main || !layer || !markers.length) return;

  const memberSection = document.querySelector(".member-section");
  const memberNames = ["xiao", "yueqi", "dingning", "kexin", "rongxi"];
  const defaultXs = [0.13, 0.31, 0.5, 0.69, 0.87];
  const defaultY = memberSection
    ? (memberSection.offsetTop + memberSection.offsetHeight - 74) / main.scrollHeight
    : 0.2;
  const defaults = Object.fromEntries(
    memberNames.map((member, index) => [member, { x: defaultXs[index], y: defaultY }])
  );
  const storageKey = "worker-centered-ai-member-positions";
  const databaseUrl = (window.WORKSHOP_COLLABORATION?.firebaseDatabaseUrl || "").replace(/\/+$/, "");
  const endpoint = databaseUrl ? `${databaseUrl}/memberPositions.json` : "";
  let positions = loadLocal();
  let stream;

  function isPoint(point) {
    return Number.isFinite(point?.x) && Number.isFinite(point?.y);
  }

  function mergePositions(source) {
    if (!source || typeof source !== "object") return;
    memberNames.forEach((member) => {
      if (isPoint(source[member])) positions[member] = source[member];
    });
  }

  function loadLocal() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return Object.fromEntries(
        memberNames.map((member) => [
          member,
          isPoint(stored[member]) ? stored[member] : defaults[member]
        ])
      );
    } catch {
      return { ...defaults };
    }
  }

  function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(positions));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function render() {
    const mainRect = main.getBoundingClientRect();
    const pageTop = mainRect.top + window.scrollY;
    const pageLeft = mainRect.left + window.scrollX;
    markers.forEach((marker) => {
      const point = isPoint(positions[marker.dataset.member])
        ? positions[marker.dataset.member]
        : defaults[marker.dataset.member];
      const markerWidth = marker.offsetWidth || 58;
      const markerHeight = marker.offsetHeight || 80;
      const x = pageLeft + point.x * mainRect.width - markerWidth / 2;
      const y = pageTop + point.y * main.scrollHeight - markerHeight / 2;
      marker.style.left = `${x}px`;
      marker.style.top = `${y}px`;
    });
  }

  async function saveShared(member) {
    saveLocal();
    if (!endpoint) return;
    const memberEndpoint = `${databaseUrl}/memberPositions/${member}.json`;
    try {
      await fetch(memberEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(positions[member])
      });
      status.textContent = "成员位置已同步";
    } catch {
      status.textContent = "网络暂不可用，位置已保存在本机";
    }
  }

  async function connect() {
    if (!endpoint) {
      status.textContent = "当前为本机保存；连接共享数据库后将自动实时同步";
      render();
      return;
    }

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("Unable to load shared positions");
      const shared = await response.json();
      mergePositions(shared);
      saveLocal();
      render();
      status.textContent = "成员位置已实时同步";
    } catch {
      status.textContent = "共享连接暂不可用，已使用本机位置";
    }

    stream = new EventSource(endpoint);
    stream.addEventListener("put", (event) => {
      const message = JSON.parse(event.data);
      if (message.path === "/" && message.data) {
        mergePositions(message.data);
      } else if (message.path && message.data) {
        const member = message.path.replace(/^\//, "");
        if (defaults[member] && isPoint(message.data)) positions[member] = message.data;
      }
      saveLocal();
      render();
    });
  }

  markers.forEach((marker) => {
    marker.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      marker.setPointerCapture(event.pointerId);
      marker.classList.add("is-dragging");

      const move = (moveEvent) => {
        const mainRect = main.getBoundingClientRect();
        const localX = moveEvent.clientX - mainRect.left;
        const localY = moveEvent.clientY - mainRect.top;
        positions[marker.dataset.member] = {
          x: clamp(localX / mainRect.width, 0.02, 0.98),
          y: clamp(localY / main.scrollHeight, 0.01, 0.99)
        };
        render();
      };

      const end = () => {
        marker.classList.remove("is-dragging");
        marker.removeEventListener("pointermove", move);
        marker.removeEventListener("pointerup", end);
        marker.removeEventListener("pointercancel", end);
        saveShared(marker.dataset.member);
      };

      marker.addEventListener("pointermove", move);
      marker.addEventListener("pointerup", end);
      marker.addEventListener("pointercancel", end);
    });
  });

  window.addEventListener("resize", render);
  window.addEventListener("beforeunload", () => stream?.close());
  connect();
})();
