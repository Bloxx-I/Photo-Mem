# Photo-Mem 🧠

Eine installierbare Web-App (PWA) für Gedächtnistraining. Sie setzt die drei Methoden aus dem Reel
„3 ways to develop photographic memory“ um:

1. **🎯 Recall-Drill** – Zufällige Objekte werden für ein paar Sekunden gezeigt. Danach markierst du aus
   einer gemischten Auswahl die, die du gesehen hast. Vier Schwierigkeitsstufen (6–16 Objekte).
2. **🗂️ Leitner-System** – Karteikarten in 5 Boxen. Wer eine Karte weiß, schiebt sie eine Box weiter
   (Wiederholung nach 1 / 2 / 4 / 8 / 16 Tagen). Wer sie nicht weiß, schickt sie zurück in Box 1.
   Einzelne Karten anlegen oder viele per `Frage ; Antwort` importieren.
3. **📝 Blurting** – Text lesen, verdecken, alles auf ein leeres Blatt schreiben. Danach markiert die App
   im Original, welche Schlüsselbegriffe du erinnert und welche du vergessen hast. Aus den Lücken
   kannst du mit einem Klick Lückentext-Karten fürs Leitner-System erzeugen.

Dazu: Trainingsserie (🔥 Tage in Folge), Statistik pro Methode und JSON-Backup (Export/Import).

## Starten

Kein Build-Schritt nötig – nur statische Dateien:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Auf dem Handy über HTTPS hosten (z. B. GitHub Pages) und im Browser „Zum Home-Bildschirm“ wählen –
dann läuft die App wie eine native App und funktioniert auch offline.

## Daten

Alle Daten bleiben lokal im Browser (`localStorage`). Über **Statistik → Backup exportieren** sicherst du sie.
