# Easy Access — User Guidelines

Welcome to Easy Access! This guide is written for non-technical users to help you understand exactly what this software does and how to use it safely.

---

## What is Easy Access?

Imagine you are away from home on vacation, and you realize you left an important document on your home computer. Normally, you wouldn't be able to get it without physically being at your computer.

**Easy Access solves this.** It acts like a secure, private bridge between your home computer and your web browser. 

It lets you log into a private website (the **Hub**) from anywhere in the world, browse the folders on your home computer, and securely download, upload, or delete files just as if you were sitting right in front of it.

## The Two Pieces of the Puzzle

Easy Access is made of two separate programs that talk to each other:

1. **The Hub (Your Dashboard):**
   Think of this as your command center. This is the website you log into with a username and password. You only install and run this in one place (either on your main computer, or on a cloud server). You use this to view and manage your files.

2. **The Agent (The Helper):**
   Think of this as an invisible helper that lives on the computer you want to access. You install the Agent on your home PC, your laptop, or your office computer. Its only job is to quietly connect to your Hub and say, *"I am online! What files do you want me to fetch?"*

---

## How to Use It (Step-by-Step)

### Step 1: Open Your Dashboard
Open your web browser and go to your Hub's address (if you are testing it at home, this is usually `http://localhost:3000`).
* Log in using your username and password (the default is `admin` / `admin`).

### Step 2: Add a "Server"
In Easy Access, any computer you want to connect to is called a "Server".
1. Click on **Servers** in the left menu.
2. Click the **Add Server** button.
3. Give it a name you will recognize, like "My Laptop" or "Home Office PC".
4. Choose the folders you want to share. **This is important for your security!** The Agent will *only* let you access the folders you select here. It cannot look at the rest of your computer.
5. Click **Create Server**. You will be given a long string of random text called an **Agent Token**. Think of this as a secret password just for this computer. Copy it!

### Step 3: Connect Your Computer
Now, you need to tell your computer to connect to the dashboard. On the computer you want to access, you will run a quick setup script:
1. It will ask for your **Hub URL** (the address of your dashboard).
2. It will ask for your **Agent Token** (the secret password you just copied).
3. It will ask you to confirm the folders you want to share.

Once you finish the setup, start the Agent program.

### Step 4: Browse Your Files!
Go back to your dashboard in your web browser. 
You will see that "My Laptop" now has a green **Online** badge! 
Click **Browse Files**, and you will instantly see your folders. You can click on files to preview them, download them to your current device, or upload new files straight to your laptop.

---

## Frequently Asked Questions

**Q: Is it safe? Can hackers see all my files?**
A: Easy Access is very secure. You are the only one with the login to the Dashboard. Furthermore, the Agent has a strict security lock: it will physically refuse to read or write any files outside of the specific folders you explicitly selected during setup.

**Q: Do I need a dashboard on every computer?**
A: No! You only have ONE dashboard. You can install the small, invisible Agent on as many computers as you want, and they will all show up in your single dashboard.

**Q: Why does it say "Server is offline"?**
A: This means the dashboard cannot reach the Agent. Make sure the computer you are trying to access is turned on, connected to the internet, and that the Agent program is currently running.
