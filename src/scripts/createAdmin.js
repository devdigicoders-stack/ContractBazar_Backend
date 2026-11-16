const readline = require('readline');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Admin = require('../models/Admin');

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function createAdmin() {
  console.log('\n======================================================');
  console.log('       CONTRACT BAZAR - SUPER ADMIN CREATOR CLI       ');
  console.log('======================================================\n');

  let rl = null;
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contract_bazar';
    console.log(`Connecting to database: ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    console.log('Database connected successfully!\n');

    // Check if arguments were passed directly: node createAdmin.js <name> <email> <password> <phone> <role>
    const args = process.argv.slice(2);
    let name = args[0];
    let email = args[1];
    let password = args[2];
    let phone = args[3] || '9876543210';
    let role = args[4] || 'super_admin';

    if (!name || !email || !password) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // 1. Name
      while (!name) {
        name = await ask(rl, 'Enter Admin Full Name: ');
        if (!name) console.log('❌ Name cannot be empty!');
      }

      // 2. Email
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      while (!email || !emailRegex.test(email)) {
        email = await ask(rl, 'Enter Admin Email Address: ');
        email = email.toLowerCase();
        if (!emailRegex.test(email)) {
          console.log('❌ Please enter a valid email address!');
        }
      }

      // Check if exists
      const existing = await Admin.findOne({ email });
      if (existing) {
        console.log(`\n⚠️  Admin with email "${email}" already exists!`);
        const updateChoice = await ask(rl, 'Do you want to update their password? (y/n): ');
        if (updateChoice.toLowerCase() === 'y') {
          let newPass = '';
          while (newPass.length < 6) {
            newPass = await ask(rl, 'Enter New Password (min 6 chars): ');
            if (newPass.length < 6) console.log('❌ Password must be at least 6 characters!');
          }
          existing.password = newPass;
          existing.name = name;
          await existing.save();
          console.log('\n✅ Admin credentials updated successfully in MongoDB!');
          if (rl) rl.close();
          process.exit(0);
        } else {
          console.log('Operation aborted.');
          if (rl) rl.close();
          process.exit(0);
        }
      }

      // 3. Password
      while (!password || password.length < 6) {
        password = await ask(rl, 'Enter Secure Password (min 6 chars): ');
        if (password.length < 6) console.log('❌ Password must be at least 6 characters!');
      }

      // 4. Phone
      phone = await ask(rl, 'Enter Contact Mobile Number (optional): ');

      // 5. Role
      console.log('\nSelect Admin Role:');
      console.log('  1) super_admin (Full Access - Default)');
      console.log('  2) sub_admin (Operations & Verification)');
      console.log('  3) manager (Reports & Catalog)');
      const roleChoice = await ask(rl, 'Enter Choice [1-3, default 1]: ');
      if (roleChoice === '2') role = 'sub_admin';
      else if (roleChoice === '3') role = 'manager';
      else role = 'super_admin';
    }

    // Check existing if passed through arguments
    const existing = await Admin.findOne({ email });
    if (existing) {
      existing.name = name;
      existing.password = password;
      existing.phone = phone;
      existing.role = role;
      existing.isActive = true;
      await existing.save();
      console.log(`\n✅ Existing Admin "${email}" updated successfully with new password!`);
    } else {
      const newAdmin = new Admin({
        name,
        email,
        password,
        phone,
        role,
        isActive: true,
      });
      await newAdmin.save();
      console.log('\n🎉 ======================================================');
      console.log('      SUPER ADMIN ACCOUNT CREATED SUCCESSFULLY!        ');
      console.log('========================================================');
      console.log(` 👤 Name:  ${newAdmin.name}`);
      console.log(` 📧 Email: ${newAdmin.email}`);
      console.log(` 🔑 Role:  ${newAdmin.role}`);
      console.log(` 📱 Phone: ${newAdmin.phone || 'N/A'}`);
      console.log('========================================================\n');
    }

    if (rl) rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating admin:', error.message);
    if (rl) rl.close();
    process.exit(1);
  }
}

createAdmin();
