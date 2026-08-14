# Kurtar

Türkiye için Too Good To Go usulü gün-sonu sürpriz paket pazaryeri. İşletmeler günün fazlasını uygun fiyata paketler, müşteriler uygulamadan satın alıp mağazadan gel-al yapar.

## Geliştirme ortamını ayağa kaldırma

1. Yerel altyapıyı başlat (PostgreSQL/PostGIS + Redis):

   ```bash
   docker compose -f ops/docker-compose.yml up -d
   ```

2. Bağımlılıkları kur:

   ```bash
   npm i
   ```

3. Backend'i geliştirme modunda çalıştır:

   ```bash
   npm run dev -w backend
   ```

API varsayılan olarak `http://localhost:4750/api` altında ayağa kalkar; sağlık kontrolü için `GET /api/health`.

Ortam değişkenleri için `.env.example` dosyasına bakın.
