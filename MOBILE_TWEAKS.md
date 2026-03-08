# Mobile Platform Tweaks

## Wijzigingen

### 1. Vite Build Configuration
**Bestand**: `note-markdown-client/vite.config.mts`

Toegevoegd externe module configuratie voor Tauri API's:
```typescript
build: {
  rollupOptions: {
    external: (id) => {
      // External all @tauri-apps imports during build
      // They will be available at runtime in the Tauri webview
      return id.startsWith('@tauri-apps/');
    }
  }
}
```

Dit zorgt ervoor dat Tauri API imports niet gebundeld worden maar beschikbaar zijn in de runtime.

### 2. Platform Detectie
**Bestand**: `shared/note-shared-utils/src/platformUtils.ts`

Nieuwe utility functies toegevoegd voor platform detectie:
- `getPlatform()` - Detecteert het huidige platform
- `isAndroid()` - Check of platform Android is
- `isIOS()` - Check of platform iOS is
- `isMobile()` - Check of platform mobile is (Android of iOS)
- `isDesktop()` - Check of platform desktop is

Deze functies gebruiken de Tauri OS API (via dynamic import) met een fallback naar user agent detectie. De dynamic import zorgt ervoor dat de code alleen in een Tauri environment wordt uitgevoerd.

### 3. Enter-toets Fix voor Android
**Bestand**: `shared/note-shared-editor/src/MarkdownEditor.svelte`

**Probleem**: Op Android keyboards gaat de Enter-toets niet naar een volgende regel.

**Oplossing**:
- Toegevoegd: `isMobilePlatform` prop aan de MarkdownEditor component
- Op mobile platforms wordt een expliciete Enter keymap toegevoegd die `insertNewlineAndIndent` aanroept
- Dit zorgt ervoor dat de Enter-toets correct werkt op Android keyboards

```typescript
// On mobile platforms, ensure Enter key works properly
if (isMobilePlatform) {
  shortcuts.push({
    key: "Enter",
    run: (view) => {
      return insertNewlineAndIndent(view);
    },
  });
}
```

### 4. Android Statusbar Compensatie
**Bestanden**:
- `note-markdown-client/src/App.svelte` (CSS)
- `note-markdown-client/index.html` (viewport meta tag)

**Probleem**: De titlebar moet rekening houden met de hoogte van de Android statusbar.

**Oplossing**:
1. **HTML viewport meta tag**: Toegevoegd `viewport-fit=cover` voor safe-area support
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
   ```

2. **CSS safe-area padding**: De titlebar krijgt extra padding-top op Android
   ```css
   .tabs.android {
     padding-top: max(env(safe-area-inset-top), 28px);
   }
   ```

3. **Dynamic viewport height**: Gebruikt `100dvh` voor betere ondersteuning van keyboard behavior
   ```css
   .app-shell {
     height: 100vh;
     height: 100dvh; /* Fallback voor browsers die dvh niet ondersteunen */
   }
   ```

### 5. App.svelte Updates
**Bestand**: `note-markdown-client/src/App.svelte`

- Platform detectie bij bootstrap
- `isMobilePlatform` en `isAndroidPlatform` state variabelen
- `isMobilePlatform` wordt doorgegeven aan MarkdownEditor component
- `android` CSS class wordt toegevoegd aan tabs section op Android

## Testen

### Android Build & Test
```bash
cd note-markdown-client
pnpm run android:dev
```

### Test Checklist
- [ ] Enter-toets op Android keyboard gaat naar volgende regel
- [ ] Titlebar heeft correcte afstand tot bovenkant van scherm (geen overlap met statusbar)
- [ ] Keyboard toont/verbergt correct zonder layout problemen
- [ ] Desktop versie werkt nog steeds correct (geen regressies)

### Verwacht Gedrag

**Op Android:**
- De titlebar (tabs sectie) begint onder de statusbar
- Er is ~28px extra padding bovenaan de titlebar
- Enter-toets in de editor werkt normaal voor nieuwe regels
- Keyboard verschijnen/verdwijnen past de viewport height aan

**Op Desktop:**
- Geen visuele veranderingen
- Enter-toets werkt zoals voorheen
- Geen extra padding bovenaan

## Troubleshooting

### Enter-toets werkt nog steeds niet
- Check of `isMobilePlatform` correct wordt doorgegeven in de console
- Verifieer dat de platform detectie werkt: `await isMobile()`

### Statusbar overlap
- Controleer of `viewport-fit=cover` aanwezig is in index.html
- Test met verschillende Android versies (statusbar hoogte kan variëren)
- Pas de fallback waarde aan in CSS indien nodig (nu 28px)

### Desktop regressies
- Verifieer dat platform detectie `false` teruggeeft voor `isAndroid()` op desktop
- Check dat de `.android` class niet wordt toegepast op desktop

## Architectuur

Deze oplossing is gebouwd met **separation of concerns**:
- Platform detectie in `shared-utils` (herbruikbaar)
- Editor aanpassingen in `shared-editor` (configureerbaar via props)
- App-specifieke styling in `client/App.svelte`

Dit betekent dat:
- Desktop builds geen mobile code uitvoeren (alleen detectie)
- Mobile-specific code geïsoleerd is
- Andere apps (zoals note-markdown-sticky) dezelfde utilities kunnen gebruiken
