# 🎬 PulseGen

**PulseGen** is a robust video sharing and streaming platform built with the MERN stack. It features a complete role-based access control system where Editors upload content, Admins moderate (approve/reject) videos, and Viewers watch and vote in real-time.

## 🚀 Features

### 🛡️ Role-Based Access Control (RBAC)
* **Viewers:** Can stream live videos, like/dislike, and search the library.
* **Editors:** Can upload videos to their own channel and manage their content.
* **Admins:** Have global access to manage users and approve/reject video submissions.

### 📹 Video Workflow
1.  **Upload:** Editors upload videos (MP4/WebM).
2.  **Processing:** Server auto-generates thumbnails and extracts metadata using `ffmpeg`.
3.  **Moderation:** Videos enter a **"Draft"** state. Admins must click **"Approve"** to make them live.
4.  **Streaming:** Optimized partial content streaming (supports seeking).

### ✨ UI/UX Highlights
* **Real-time Updates:** Socket.io integration for instant status updates and processing bars.
* **Search & Filter:** Client-side filtering by title and username.
* **Smart Badges:** "Verified" badges for Admins and dynamic status badges (Draft/Live/Rejected).
* **Polished Interface:** "Time Ago" timestamps, glassmorphism headers, and responsive grid layouts.

## 🛠️ Tech Stack

* **Frontend:** React.js, React Router, Axios, Lucide React (Icons)
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (Mongoose)
* **Media Engine:** FFmpeg & FFprobe (Static Binaries)
* **Real-time:** Socket.io
* **Auth:** JWT (JSON Web Tokens) & Bcrypt

## ⚙️ Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone [https://github.com/yourusername/pulsegen.git](https://github.com/yourusername/pulsegen.git)
    cd pulsegen
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```
    *Note: This automatically installs `ffmpeg-static` and `ffprobe-static`, so you don't need to install software manually.*

3.  **Configure Environment**
    Create a `.env` file in the root directory (optional, defaults provided in code):
    ```env
    PORT=3000
    MONGODB_URI=mongodb://127.0.0.1:27017/pulse-v7
    ```

4.  **Start the Server**
    ```bash
    node server.js
    ```

5.  **Start the Frontend**
    (Open a new terminal)
    ```bash
    npm run dev
    # or
    npm start
    ```

## 🧪 Usage Guide

### Creating an Admin User
Since there is no "Sign Up as Admin" button for security, you can manually set a user to admin in MongoDB, or use the registration form to create a "Viewer" and then change the role in the database.

* **Test Admin Credentials (Example):**
    * **Email:** `admin@pulsegen.com`
    * **Password:** `admin123`
    *(Make sure to create this user first!)*

## 📂 Project Structure

```bash
pulsegen/
├── server.js           # Main backend entry point & API routes
├── uploads/            # Video storage (gitignored)
├── src/
│   ├── App.jsx         # Main Frontend Application & Logic
│   ├── App.css         # Styling & Themes
│   └── main.jsx        # React DOM entry
└── package.json        # Dependencies
