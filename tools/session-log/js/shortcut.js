(function(){
  function isMac(){ return navigator.platform.toUpperCase().includes("MAC"); }
  function isMod(event){ return isMac() ? event.metaKey : event.ctrlKey; }

  function openShortcutPanel(){
    const panel = document.getElementById("shortcutPanel");
    if(!panel) return;
    panel.hidden = false;
    requestAnimationFrame(()=>panel.classList.add("open"));
  }

  function closeShortcutPanel(){
    const panel = document.getElementById("shortcutPanel");
    if(!panel || panel.hidden) return;
    panel.classList.remove("open");
    window.setTimeout(()=>{ if(!panel.classList.contains("open")) panel.hidden = true; }, 220);
  }

  function toggleShortcutPanel(){
    const panel = document.getElementById("shortcutPanel");
    if(!panel) return;
    if(panel.hidden || !panel.classList.contains("open")) openShortcutPanel();
    else closeShortcutPanel();
  }

  window.SessionLogShortcuts = { openShortcutPanel, closeShortcutPanel, toggleShortcutPanel };

  document.addEventListener("DOMContentLoaded",()=>{
    document.getElementById("shortcutHelpBtn")?.addEventListener("click", toggleShortcutPanel);
    document.getElementById("closeShortcutBtn")?.addEventListener("click", closeShortcutPanel);

    document.addEventListener("keydown",(event)=>{
      const key = event.key.toLowerCase();
      if(event.key === "Escape"){
        closeShortcutPanel();
        window.SessionLogApp?.closeDrawer?.();
        return;
      }

      if(!isMod(event)) return;

      if(event.shiftKey && key === "s"){
        event.preventDefault();
        openShortcutPanel();
        return;
      }
      if(event.shiftKey && key === "n"){
        event.preventDefault();
        window.SessionLogApp?.openSessionDialog?.();
        return;
      }
      if(event.shiftKey && key === "f"){
        event.preventDefault();
        document.getElementById("searchInput")?.focus();
        return;
      }

      if(key === "j"){
        event.preventDefault();
        window.SessionLogApp?.openImportDialog?.();
      }
      if(key === "e"){
        event.preventDefault();
        window.SessionLogApp?.exportJson?.();
      }
    });
  });
})();
