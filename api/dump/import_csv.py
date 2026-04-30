import csv
import os
import random
import hashlib
import mysql.connector
from datetime import datetime, timedelta

def get_max_user_id(db_credentials):
    """
    Connects to the database and gets the maximum userId from the kemri_users table.
    Returns 0 if the connection fails or the table is empty.
    """
    try:
        db = mysql.connector.connect(
            host=db_credentials['host'],
            user=db_credentials['user'],
            password=db_credentials['password'],
            database=db_credentials['database']
        )
        cursor = db.cursor()
        cursor.execute("SELECT MAX(userId) FROM kemri_users")
        result = cursor.fetchone()
        
        # Fetch the max ID, defaulting to 0 if the table is empty
        max_id = result[0] if result[0] is not None else 0
        
        cursor.close()
        db.close()
        print(f"Successfully retrieved maximum user ID: {max_id}")
        return max_id
    except mysql.connector.Error as err:
        print(f"Error connecting to MySQL: {err}")
        # Default to 0 if connection fails, so new IDs start from 1
        return 0

def get_max_contractor_id(db_credentials):
    """
    Connects to the database and gets the maximum contractorId from the kemri_contractors table.
    Returns 0 if the connection fails or the table is empty.
    """
    try:
        db = mysql.connector.connect(
            host=db_credentials['host'],
            user=db_credentials['user'],
            password=db_credentials['password'],
            database=db_credentials['database']
        )
        cursor = db.cursor()
        cursor.execute("SELECT MAX(contractorId) FROM kemri_contractors")
        result = cursor.fetchone()
        
        max_id = result[0] if result[0] is not None else 0
        
        cursor.close()
        db.close()
        print(f"Successfully retrieved maximum contractor ID: {max_id}")
        return max_id
    except mysql.connector.Error as err:
        print(f"Error connecting to MySQL: {err}")
        return 0

def generate_users(num_users, roles, starting_id):
    """
    Generates a list of dictionaries containing mock user data.
    The password is a SHA-256 hash of 'reset123' for demonstration purposes.
    The new user IDs will start from the provided starting_id.
    Returns the list of user records.
    """
    users = []
    # Using SHA-256 hash for 'reset123'
    password_hash = hashlib.sha256('reset123'.encode('utf-8')).hexdigest()
    
    first_names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah']
    last_names = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Evans', 'Miller', 'Taylor']
    
    for i in range(starting_id + 1, starting_id + num_users + 1):
        first_name = random.choice(first_names)
        last_name = random.choice(last_names)
        username = f'{first_name.lower()}{i:02d}'
        email = f'{username}@kisumu.co.ke'
        
        user_record = {
            'userId': i,
            'username': username,
            'passwordHash': password_hash,
            'email': email,
            'firstName': first_name,
            'lastName': last_name,
            'roleId': random.choice(roles),
            'isActive': 1,
            'createdAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'voided': 0
        }
        users.append(user_record)
    return users

def generate_contractors(num_contractors, starting_id):
    """
    Generates a list of dictionaries for the kemri_contractors table.
    """
    contractors = []
    company_suffixes = ['Solutions', 'Enterprises', 'Ventures', 'Holdings', 'Builders', 'Pty Ltd']
    company_prefixes = ['Green Earth', 'Tech Innovations', 'Urban', 'Coastal', 'Nexus', 'Prime']
    contact_names = ['John Doe', 'Jane Smith', 'Peter Jones', 'Mary Williams']
    
    for i in range(starting_id + 1, starting_id + num_contractors + 1):
        company_name = f'{random.choice(company_prefixes)} {random.choice(company_suffixes)}'
        contact_person = random.choice(contact_names)
        email = f'{company_name.lower().replace(" ", "")}{i}@example.com'
        phone = f'2547{random.randint(10000000, 99999999)}'
        
        contractor_record = {
            'contractorId': i,
            'companyName': company_name,
            'contactPerson': contact_person,
            'email': email,
            'phone': phone,
            'createdAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'voided': 0
        }
        contractors.append(contractor_record)
    return contractors

def generate_contractor_user_assignments(user_ids, contractor_ids):
    """
    Generates a list of dictionaries for the kemri_contractor_users table.
    Links users to contractors.
    """
    assignments = []
    # Assign at least one user to each contractor
    for contractor_id in contractor_ids:
        user_id = random.choice(user_ids)
        assignments.append({
            'userId': user_id,
            'contractorId': contractor_id
        })
    return assignments

def generate_project_contractor_assignments(project_ids, contractor_ids):
    """
    Generates a list of dictionaries for the kemri_project_contractor_assignments table.
    Links projects to contractors.
    """
    assignments = []
    for project_id in project_ids:
        # Assign a random number of contractors to each project (1 to 3)
        num_assignments = random.randint(1, 3)
        assigned_contractors = random.sample(contractor_ids, num_assignments)
        
        for contractor_id in assigned_contractors:
            assignments.append({
                'projectId': project_id,
                'contractorId': contractor_id,
                'assignmentDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'voided': 0
            })
    return assignments

def generate_strategic_plan_data(num_records, user_ids, contractor_ids):
    """
    Generates a list of dictionaries containing realistic strategic plan data.
    This function uses the provided list of user and contractor IDs for foreign key consistency.
    """
    # Lists for new and updated columns
    subcounties = ['Kisumu East', 'Kisumu West', 'Kisumu Central', 'Seme', 'Nyando', 'Muhoroni', 'Nyakach']
    wards = ['Konya', 'Kolwa East', 'Milimani', 'Kondele', 'Maseno', 'Manyatta B', 'Ahero', 'Awasi']
    
    # Using updated Kisumu County departments from the previous Canvas
    departments = [
        'Medical Services, Public Health and Sanitation',
        'Agriculture, Fisheries, Livestock Development and Irrigation',
        'Education, Technical Training, Innovation and Social Services',
        'Water, Environment, Natural Resources and Climate Change',
        'Finance, Economic Planning and ICT(E-Government) Services',
        'Trade, Tourism, Industry and Marketing',
        'Sports, Culture, Gender and Youth Affairs',
        'City of Kisumu Management',
        'Public Service, County Administration',
        'Infrastructure, Energy and Public Works',
        'Lands, Housing, Urban Planning and Physical Planning'
    ]
    
    project_categories = ['Public Health Initiative', 'Infrastructure', 'Education', 'Economic Empowerment', 'Sanitation']
    
    # Base lists for other fields
    plan_names = ['Kisumu Urban Strategic Plan', 'County Vision 2029', 'Five-Year Development Plan']
    program_departments = ['Public Health', 'Environmental Health', 'Water & Sanitation', 'Education']
    
    # New lists for payment and approval data
    contractor_names = ['ABC Solutions Ltd', 'Tech Innovations Co.', 'Green Earth Ventures', 'Jambo Construction']
    payment_modes = ['Bank Transfer', 'Cheque', 'Mobile Money', 'Other']
    bank_names = ['KCB Bank', 'Equity Bank', 'Co-op Bank', 'Standard Chartered']
    approval_actions = ['Approve', 'Reject', 'Comment', 'Returned for Correction', 'Assigned']
    
    data = []
    project_ids = []
    
    for i in range(1, num_records + 1):
        plan_cidpid = f'KISUMU-2024-{i:03d}'
        plan_start_date = datetime(2024, 7, 1)
        plan_end_date = datetime(2029, 6, 30)
        
        # Select random values for each row
        department = random.choice(departments)
        subcounty = random.choice(subcounties)
        ward = random.choice(wards)
        project_category = random.choice(project_categories)
        
        # Generate project, milestone, and activity names
        project_name = f'Project {i:02d} in {subcounty}'
        milestone_name = f'Milestone {random.randint(1, 5)} for {project_name}'
        
        activity_start_date = datetime(2024, random.randint(7, 12), random.randint(1, 28))
        activity_end_date = activity_start_date + timedelta(days=random.randint(30, 90))
        milestone_due_date = activity_end_date + timedelta(days=random.randint(1, 15))
        
        activity_name = f'Activity {random.randint(1, 10)} for {project_name}'
        
        # Generate data for new fields
        # Using a fixed and predictable projectId for now, based on the Plan_CIDPID
        project_id = i
        project_ids.append(project_id)
        
        contractor_id = random.choice(contractor_ids)
        request_id = i * 10
        payment_mode = random.choice(payment_modes)
        
        record = {
            # Strategic Plan Fields
            'Plan_CIDPID': plan_cidpid,
            'Plan_Name': random.choice(plan_names),
            'Plan_StartDate': plan_start_date.strftime('%Y-%m-%d'),
            'Plan_EndDate': plan_end_date.strftime('%Y-%m-%d'),
            'Program_Name': f'Program {i}',
            'Program_Department': department,
            'Program_Section': f'Section {i}',
            'Program_NeedsPriorities': 'High prevalence of diseases; inadequate infrastructure.',
            'Program_Strategies': 'Implement community-led programs.',
            'Program_Objectives': 'Reduced disease incidence; Improved infrastructure.',
            'Program_Outcomes': 'A healthier urban environment.',
            'Program_Remarks': 'Partnerships with local clinics and NGOs.',
            'Subprogram_Name': f'Subprogram {i}',
            'Subprogram_KeyOutcome': f'Improved {department} services',
            'Subprogram_KPI': 'Service rate (%)',
            'Subprogram_Baseline': random.randint(50, 80),
            'Subprogram_Yr1Targets': random.randint(81, 90),
            'Subprogram_Yr2Targets': random.randint(91, 95),
            'Subprogram_Yr3Targets': random.randint(96, 100),
            'Subprogram_Yr4Targets': 100,
            'Subprogram_Yr5Targets': 100,
            'Subprogram_Yr1Budget': random.randint(1000000, 5000000),
            'Subprogram_Yr2Budget': random.randint(5000000, 10000000),
            'Subprogram_Yr3Budget': random.randint(10000000, 20000000),
            'Subprogram_Yr4Budget': random.randint(20000000, 30000000),
            'Subprogram_Yr5Budget': random.randint(30000000, 50000000),
            'Subprogram_TotalBudget': random.randint(100000000, 200000000),
            'Subprogram_Remarks': 'Community training and deployment.',
            'Workplan_Name': f'FY 2024/2025 {department} Workplan',
            'Workplan_FinancialYear': '2024/2025',
            'Workplan_TotalBudget': random.randint(5000000, 15000000),
            'Project_Name': project_name,
            'Project_Category': project_category,
            'Project_Cost': random.randint(1000000, 5000000),
            'Milestone_Name': milestone_name,
            'Milestone_DueDate': milestone_due_date.strftime('%Y-%m-%d'),
            'Activity_Name': activity_name,
            'Activity_StartDate': activity_start_date.strftime('%Y-%m-%d'),
            'Activity_EndDate': activity_end_date.strftime('%Y-%m-%d'),
            'Activity_BudgetAllocated': random.randint(100000, 500000),
            'Subcounty': subcounty,
            'Ward': ward,
            'Department': department,
            
            # New Payment Request Fields (from kemri_project_payment_requests)
            'Request_ID': request_id,
            'Request_ProjectId': project_id,
            'Request_ContractorId': contractor_id,
            'Request_Amount': f'{random.randint(50000, 2000000):.2f}',
            'Request_Description': f'Payment for project milestone completion in {subcounty}.',
            'Request_CurrentApprovalLevelId': random.randint(1, 5),
            'Request_PaymentStatusId': random.randint(1, 10),
            'Request_SubmittedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'Request_ApprovedByUserId': random.choice(user_ids), # Use a random existing user ID
            'Request_ApprovalDate': (datetime.now() + timedelta(days=random.randint(1, 10))).strftime('%Y-%m-%d %H:%M:%S'),
            'Request_Comments': f'Payment approved by {random.choice(departments)}.',

            # New Payment Details Fields (from kemri_payment_details)
            'Details_PaymentMode': payment_mode,
            'Details_BankName': random.choice(bank_names) if payment_mode == 'Bank Transfer' else '',
            'Details_AccountNumber': random.randint(1000000000, 9999999999) if payment_mode == 'Bank Transfer' else '',
            'Details_TransactionId': f'TXN{random.randint(10000000, 99999999)}',
            'Details_PaidByUserId': random.choice(user_ids), # Use a random existing user ID
            'Details_PaidAt': (datetime.now() + timedelta(days=random.randint(1, 10))).strftime('%Y-%m-%d %H:%M:%S'),
            'Details_Notes': f'Payment successfully processed on {datetime.now().strftime("%Y-%m-%d")}.',

            # New Approval History Fields (from kemri_payment_approval_history)
            'History_Action': random.choice(approval_actions),
            'History_ActionByUserId': random.choice(user_ids), # Use a random existing user ID
            'History_AssignedToUserId': random.choice(user_ids), # Use a random existing user ID
            'History_ActionDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'History_Notes': f'Approval note for stage {random.randint(1, 5)}.'
        }
        data.append(record)
        
    return data, project_ids

def save_to_csv(data, filename):
    """Saves the generated data to a CSV file."""
    if not data:
        print("No data to save.")
        return

    # Dynamically get headers from the first record
    headers = list(data[0].keys())
    
    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data)
    print(f"Successfully generated and saved {len(data)} records to '{filename}'.")
    # Added a print statement to show the headers being used
    print(f"Columns written to CSV: {headers}")

if __name__ == '__main__':
    # Database credentials for getting max ID
    db_credentials = {
        'host': os.environ.get('MYSQL_HOST', 'localhost'),
        'user': os.environ.get('MYSQL_USER', 'root'),
        'password': os.environ.get('MYSQL_PASSWORD', 'postgres'),
        'database': os.environ.get('MYSQL_DATABASE', 'kemri')
    }

    # 1. Generate and save user data
    max_user_id = get_max_user_id(db_credentials)
    users_data = generate_users(20, [1, 2, 3], max_user_id)
    save_to_csv(users_data, 'kemri_users.csv')
    user_ids = [user['userId'] for user in users_data]
    
    # 2. Generate and save contractor data
    max_contractor_id = get_max_contractor_id(db_credentials)
    contractors_data = generate_contractors(10, max_contractor_id)
    save_to_csv(contractors_data, 'kemri_contractors.csv')
    contractor_ids = [contractor['contractorId'] for contractor in contractors_data]
    
    # 3. Generate strategic plan data and get project IDs
    test_data, project_ids = generate_strategic_plan_data(25, user_ids, contractor_ids)
    save_to_csv(test_data, 'kisumu_strategic_plan_data.csv')
    
    # 4. Generate and save contractor user assignments
    contractor_user_assignments_data = generate_contractor_user_assignments(user_ids, contractor_ids)
    save_to_csv(contractor_user_assignments_data, 'kemri_contractor_users.csv')
    
    # 5. Generate and save project contractor assignments
    project_contractor_assignments_data = generate_project_contractor_assignments(project_ids, contractor_ids)
    save_to_csv(project_contractor_assignments_data, 'kemri_project_contractor_assignments.csv')
