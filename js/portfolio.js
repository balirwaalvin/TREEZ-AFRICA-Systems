/* ============================================
   TREEZ AFRICA SYSTEMS — Portfolio JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ---- Filter ----
  const filterBtns = document.querySelectorAll('.filter-btn');
  const portfolioCards = document.querySelectorAll('.portfolio-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      portfolioCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.classList.remove('hidden');
          card.style.animation = 'fadeIn 0.5s ease forwards';
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });

  // ---- Modal ----
  const modal = document.getElementById('portfolioModal');
  const modalContent = document.getElementById('modalBody');
  const modalClose = document.querySelectorAll('.modal-close');

  // Project data
  const projectData = {
    1: {
      title: 'FinBank Digital Platform',
      category: 'Enterprise Banking',
      challenge: 'A leading East African bank needed a complete digital transformation of their legacy banking systems to support mobile banking, real-time transactions, and improve customer experience.',
      solution: 'We designed and built a comprehensive digital banking platform featuring mobile apps (iOS/Android), a responsive web portal, real-time payment processing, and an advanced analytics dashboard for bank administrators.',
      result: 'Transaction processing speed increased by 300%, customer onboarding time reduced by 70%, and mobile banking adoption grew by 250% within the first year.',
      tech: ['React', 'Node.js', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes']
    },
    2: {
      title: 'AgriConnect Mobile App',
      category: 'Mobile Development',
      challenge: 'Small-scale farmers across Africa lacked access to market prices, weather data, and connections to buyers, resulting in significant crop losses and reduced income.',
      solution: 'We built a cross-platform mobile application with offline-first capabilities, real-time market pricing, weather alerts, and a buyer-seller marketplace with integrated mobile money payments.',
      result: 'Over 50,000 farmers onboarded within 6 months. Average farmer income increased by 35% through better market access and reduced post-harvest losses.',
      tech: ['Flutter', 'Firebase', 'Python', 'TensorFlow', 'Google Cloud']
    },
    3: {
      title: 'CityPay Payment Gateway',
      category: 'FinTech Solutions',
      challenge: 'A fintech startup needed a secure, scalable payment gateway that could handle multiple payment methods including mobile money, cards, and bank transfers across multiple African countries.',
      solution: 'We architected a microservices-based payment gateway with PCI-DSS compliance, fraud detection using ML, multi-currency support, and seamless integration APIs for merchants.',
      result: 'Processing over $2M in daily transactions across 5 countries with 99.99% uptime and fraud rates below 0.01%.',
      tech: ['Java', 'Spring Boot', 'Kafka', 'Redis', 'MongoDB', 'Azure']
    },
    4: {
      title: 'HealthTrack EHR System',
      category: 'Web Application',
      challenge: 'A hospital network required a unified electronic health records system to replace fragmented paper-based processes across 12 facilities.',
      solution: 'We developed a cloud-based EHR system with patient management, appointment scheduling, lab integration, telemedicine capabilities, and HIPAA-compliant data handling.',
      result: 'Patient wait times reduced by 40%, record retrieval time decreased from hours to seconds, and inter-facility referrals became seamless.',
      tech: ['Angular', 'C#', '.NET Core', 'SQL Server', 'Azure', 'HL7 FHIR']
    },
    5: {
      title: 'LogiTrack Supply Chain Platform',
      category: 'Enterprise Solution',
      challenge: 'A logistics company managing shipments across East Africa had no visibility into their supply chain, leading to delays, losses, and customer dissatisfaction.',
      solution: 'We created an end-to-end supply chain management platform with real-time GPS tracking, automated routing, warehouse management, and predictive analytics for demand forecasting.',
      result: 'Delivery times improved by 25%, fuel costs reduced by 18%, and customer satisfaction scores increased from 62% to 91%.',
      tech: ['Vue.js', 'Python', 'Django', 'PostgreSQL', 'IoT', 'AWS']
    },
    6: {
      title: 'EduLearn LMS Platform',
      category: 'Web Application',
      challenge: 'An education organization needed a learning management system to deliver courses to students across remote areas with limited internet connectivity.',
      solution: 'We built a progressive web application with offline content access, video streaming optimization, interactive assessments, progress tracking, and certification management.',
      result: 'Student completion rates increased by 60%, content delivery costs reduced by 80%, and the platform now serves over 100,000 learners.',
      tech: ['React', 'Next.js', 'Node.js', 'MongoDB', 'WebRTC', 'CDN']
    }
  };

  document.querySelectorAll('.portfolio-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      const data = projectData[id];
      if (!data || !modalContent) return;

      modalContent.innerHTML = `
        <h2>${data.title}</h2>
        <span class="badge badge-blue">${data.category}</span>
        <div class="modal-section">
          <h4><i class='bx bx-target-lock'></i> The Challenge</h4>
          <p>${data.challenge}</p>
        </div>
        <div class="modal-section">
          <h4><i class='bx bx-bulb'></i> Our Solution</h4>
          <p>${data.solution}</p>
        </div>
        <div class="modal-section">
          <h4><i class='bx bx-trending-up'></i> The Results</h4>
          <p>${data.result}</p>
        </div>
        <div class="modal-section">
          <h4><i class='bx bx-code-alt'></i> Technologies Used</h4>
          <div class="modal-tech-tags">
            ${data.tech.map(t => `<span>${t}</span>`).join('')}
          </div>
        </div>
      `;

      modal?.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  // Close modal
  modalClose.forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  function closeModal() {
    modal?.classList.remove('active');
    document.body.style.overflow = '';
  }
});

