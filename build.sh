#!/usr/bin/env bash
# Inject Gemini API key từ Render environment variable vào index.html
set -e

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Cảnh báo: GEMINI_API_KEY chưa được đặt trên Render.com — key sẽ cần nhập tay."
else
  sed -i "s/__GEMINI_API_KEY__/${GEMINI_API_KEY}/g" index.html
  echo "✅ Đã inject GEMINI_API_KEY vào index.html"
fi
