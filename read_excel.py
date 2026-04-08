import pandas as pd
import json
import traceback

def main():
    file_path = r'C:\Users\asahi\.gemini\値上げツール\43006_幸南食糧（株）.xlsx'
    try:
        xls = pd.ExcelFile(file_path)
        print("Sheets:", xls.sheet_names)
        
        for sheet_name in xls.sheet_names:
            print(f"\n--- Sheet: {sheet_name} ---")
            df = pd.read_excel(xls, sheet_name=sheet_name)
            print("Columns:", df.columns.tolist())
            print("Data sample:")
            print(df.head(5).to_string())
            
    except Exception as e:
        print("Error:")
        traceback.print_exc()

if __name__ == "__main__":
    main()
