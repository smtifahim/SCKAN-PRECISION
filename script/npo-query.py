# This script assumes that the stardog server is running. The python code runs all the necessary SPARQL queries for SCKAN Explorer
# and saves the results in corresponing json files. 
# (version: 1.0; @Author: Fahim Imam)


import os
from dotenv import load_dotenv
import stardog
import json


# Load environment variables from .env file if present
load_dotenv()

# Stardog DB connection details using environment variables for credentials
conn_details = {
    'endpoint': 'https://sd-c1e74c63.stardog.cloud:5820',
    'username': os.environ.get('SCKAN_USERNAME'),
    'password': os.environ.get('SCKAN_PASSWORD')
}

# db_name = 'SIMPLE-SCKAN-TEST-SEP'
db_name = 'SCKAN-NOV-2026'


# Directory containing the SPARQL queries and the directory to save the json results
sparql_dir = '../resource/sparql'
json_dir = '../resource/json'

# Query files to exclude from execution
excluded_query_files = [
                        'mapping-construct.rq',
                        'mapping-construct-kidney.rq',
                        ]

# File locations for the queries needed for SCKAN-Explorer (all .rq files under sparql_dir except the excluded ones)
query_files = sorted(
                     os.path.join(sparql_dir, file_name)
                     for file_name in os.listdir(sparql_dir)
                     if file_name.endswith('.rq') and file_name not in excluded_query_files
                     )

# File locations for the generated query results in json format
generated_files = [
                   os.path.join(json_dir, os.path.basename(query_file).replace('.rq', '.json'))
                   for query_file in query_files
                  ]

def checkServerStatus(admin):
    if (admin.healthcheck()):
        print ("        Server Status: Stardog server is running and able to accept traffic.")
    else:
        print ("        Server Status: Stardog server is NOT running. Please start the server and try again.")
        exit();

print ("\nProgram execution started...")
with stardog.Admin(**conn_details) as admin:  
    print ("\nStep 0: Checking Stardog server status..")
    checkServerStatus(admin)
    print ("Step 0: Done!")

with stardog.Connection(db_name, **conn_details) as conn: 
    for i, query_file in enumerate (query_files):
        print ("\nStep " + str(i+1) + ": Executing query from: " + query_file)
        with open(query_file, 'r') as file:
            query = file.read()
            result = conn.select(query, reasoning=False)
        print ("        Saving query results...")
        with open(generated_files[i], 'w') as file:
            json.dump(result, file, indent=2)
        print ("        Query results saved to: " + generated_files[i])
        print ("Step " + str(i+1) + ": Done!")
    conn.close()
print ("\nAll queries executed and results are saved successfully!\n")
