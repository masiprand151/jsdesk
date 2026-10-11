const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const searchInput = document.querySelector("#doc-search");
const emptyNotice = document.querySelector("#search-empty");
const navLinks = [...document.querySelectorAll(".nav-link")];
const sections = [...document.querySelectorAll(".doc-section")];
const positionButtons = [...document.querySelectorAll("[data-position]")];
const previewElement = document.querySelector("#preview-element");
const positionValue = document.querySelector("#position-value");
const positionOutput = document.querySelector("#position-output");

menuToggle?.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    sidebar.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

searchInput?.addEventListener("input", () => {
  const query = searchInput.value.trim().toLocaleLowerCase("id");
  let visibleCount = 0;

  sections.forEach((section) => {
    const matches =
      !query || section.textContent.toLocaleLowerCase("id").includes(query);
    section.hidden = !matches;
    visibleCount += Number(matches);
  });

  navLinks.forEach((link) => {
    const target = document.querySelector(link.getAttribute("href"));
    link.hidden = Boolean(query && target?.hidden);
  });

  emptyNotice.hidden = visibleCount !== 0;
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput?.focus();
  }
  if (event.key === "Escape") {
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input"));
    searchInput.blur();
  }
});

positionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const position = button.dataset.position;
    previewElement.dataset.position = position;
    positionValue.textContent = position;
    positionOutput.textContent = `position: "${position}"`;
    positionButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
  });
});

document.querySelectorAll(".code-panel pre").forEach((pre) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.copy = "true";
  button.textContent = "Salin kode";
  button.addEventListener("click", async () => {
    const code = pre.innerText;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Tersalin";
      window.setTimeout(() => (button.textContent = "Salin kode"), 1300);
    } catch {
      button.textContent = "Salin gagal";
      window.setTimeout(() => (button.textContent = "Salin kode"), 1300);
    }
  });
  pre.parentElement.querySelector(".code-top").append(button);
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort(
        (left, right) => right.intersectionRatio - left.intersectionRatio,
      )[0];
    if (!visible) return;

    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${visible.target.id}`;
      link.classList.toggle("active", isActive);
    });
  },
  { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.15, 0.4] },
);

sections.forEach((section) => observer.observe(section));
