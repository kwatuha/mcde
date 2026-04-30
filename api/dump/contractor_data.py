import csv
import os
import mysql.connector

def import_data_from_csv(db_credentials, filename, table_name, columns):
    """
    Imports data from a CSV file into a specified MySQL table.
    
    Args:
        db_credentials (dict): A dictionary containing database connection details.
        filename (str): The name of the CSV file to read.
        table_name (str): The name of the MySQL table to insert data into.
        columns (list): A list of column names in the correct order for the table.
    """
    try:
        db = mysql.connector.connect(
            host=db_credentials['host'],
            user=db_credentials['user'],
            password=db_credentials['password'],
            database=db_credentials['database']
        )
        cursor = db.cursor()
        
        # Construct the INSERT statement dynamically
        column_str = ', '.join(columns)
        value_placeholders = ', '.join(['%s'] * len(columns))
        insert_sql = f"INSERT INTO {table_name} ({column_str}) VALUES ({value_placeholders})"
        
        # Prepare the list of tuples to insert
        data_to_insert = []
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Ensure the data in the row matches the order of the columns
                data_row = [row[col] for col in columns]
                data_to_insert.append(data_row)
        
        if not data_to_insert:
            print(f"No data found in {filename}.")
            return
            
        print(f"Importing {len(data_to_insert)} records into '{table_name}'...")
        
        # Execute the batch insert
        cursor.executemany(insert_sql, data_to_insert)
        db.commit()
        
        print(f"Successfully imported data from '{filename}' into '{table_name}'.")
        
    except mysql.connector.Error as err:
        print(f"Error importing data from {filename}: {err}")
    except FileNotFoundError:
        print(f"Error: The file '{filename}' was not found.")
    finally:
        if 'cursor' in locals() and cursor is not None:
            cursor.close()
        if 'db' in locals() and db.is_connected():
            db.close()
            
if __name__ == '__main__':
    # Database credentials (customize as needed)
    db_credentials = {
        'host': os.environ.get('MYSQL_HOST', 'localhost'),
        'user': os.environ.get('MYSQL_USER', 'root'),
        'password': os.environ.get('MYSQL_PASSWORD', 'postgres'),
        'database': os.environ.get('MYSQL_DATABASE', 'kemri')
    }

    # Define the CSV files, their corresponding tables, and columns in the correct order
    # IMPORTANT: The column order MUST match the CSV file's header
    import_tasks = [
        {
            'filename': 'kemri_users.csv',
            'table': 'kemri_users',
            'columns': ['userId', 'username', 'passwordHash', 'email', 'firstName', 'lastName', 
                        'roleId', 'isActive', 'createdAt', 'updatedAt', 'voided']
        },
        {
            'filename': 'kemri_contractors.csv',
            'table': 'kemri_contractors',
            'columns': ['contractorId', 'companyName', 'contactPerson', 'email', 'phone', 
                        'createdAt', 'voided']
        },
        {
            'filename': 'kemri_contractor_users.csv',
            'table': 'kemri_contractor_users',
            'columns': ['userId', 'contractorId']
        },
        {
            'filename': 'kemri_project_contractor_assignments.csv',
            'table': 'kemri_project_contractor_assignments',
            'columns': ['projectId', 'contractorId', 'assignmentDate', 'voided']
        }
    ]

    # Run the import for each defined task
    for task in import_tasks:
        import_data_from_csv(
            db_credentials, 
            task['filename'], 
            task['table'], 
            task['columns']
        )
