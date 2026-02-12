@echo off
echo Starting Socket-Sync Analytics Dashboard...
cd /d "%~dp0"
python -m streamlit run analytics/dashboard.py
pause
