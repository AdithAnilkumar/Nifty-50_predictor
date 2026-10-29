@echo off
title NIFTY-50 AI Forecaster - Unified Chart Web App
echo ===================================================================
echo   NIFTY-50 AI TIME SERIES FORECASTER (EXPERIMENT 13 - CO4)
echo   Starting FastAPI Server & Unified Frontend...
echo ===================================================================
echo Opening web browser at http://localhost:8000/
start http://localhost:8000/
python server.py
pause

