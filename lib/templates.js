/**
 * Curated, gold-standard academic email templates based on successful
 * outreach sent by real engineering and research students to professors.
 */

export const EMAIL_PRESET_TEMPLATES = [
  {
    id: 'technical_bridge',
    name: '🎯 Deep Technical Bridge (Recommended)',
    subtitle: 'Inspired by successful research internship outreach (e.g. Vaibhav Kannan to iMEMS Lab)',
    description: 'Highlights 1–2 authentic prior projects/internships with specific tools and synthesizes a direct bridge to the professor\'s lab thrusts.',
    target: 'Summer/Winter Research Internship, Project Attachment, Undergrad/Master\'s Thesis',
    wordCount: '~150–180 words',
    template: `Dear Prof. {professor_name},

I am {user_name}, a student in {user_education}. I came across the work of the {lab_name} at {university} and was particularly drawn to your research focus in {research_topics}.

{applicant_relevant_experience}

Through this work in {prior_specific_tools}, I have developed a focused interest in {professor_core_domain}. Specifically, I would love to explore an opportunity to work under your guidance on {specific_sub_task_or_mechanism} as a {target_degree}.

I have attached my resume for your consideration and would be glad to discuss further if there is a suitable opportunity.

Thank you for your time.

Warm regards,
{user_name}
{user_signature}`
  },
  {
    id: 'long_term_goals',
    name: '⏱️ Long-Term Internship & Goals',
    subtitle: 'Inspired by 1-year research residency outreach (e.g. Austadish Saikia to IISc CSRL)',
    description: 'Clearly states structured research objectives (workflow mastery, publication contribution) and motivation for an extended research stay before higher studies.',
    target: '6-Month or 1-Year Pre-Doc / Research Fellow / Project Associate',
    wordCount: '~190–230 words',
    template: `Respected Dr. {professor_name} Sir,

I hope this email finds you well.

My name is {user_name}. I am a student in {user_education}. I am keenly interested in {core_field}, and especially {specialized_subfield}. I am writing to inquire if there may be a position available in your {lab_name} for a research internship under your guidance.

By taking this internship, I would like to achieve the following objectives:
* Gaining hands-on working knowledge of {methodology_or_flow}.
* Contributing to your lab's active research in {lab_research_topic} and preparing for higher research studies.

{applicant_relevant_experience}

I would be honored to contribute to the research work of your lab and learn from your mentorship. My resume is attached for your review.

Thanking you for your time and consideration. I look forward to your reply.

Sincerely,
{user_name}
{user_signature}`
  },
  {
    id: 'graduate_phd',
    name: '🎓 Prospective Graduate / PhD Inquiry',
    subtitle: 'Tailored for prospective MS by Research and PhD applicants',
    description: 'Focuses on alignment with prospective thesis topics and ongoing lab projects, presenting credentials with academic rigor.',
    target: 'Prospective MS by Research, PhD, or Direct Graduate Admission',
    wordCount: '~180–220 words',
    template: `Dear Prof. {professor_name},

I hope this email finds you well.

My name is {user_name}, and I am completing my {user_education}. Having closely followed your group's contributions in {research_topics}, I am writing to express my strong interest in joining your lab at {university} as a prospective {target_degree} researcher.

{applicant_relevant_experience}

My background in {prior_skill_or_tool} aligns closely with your group's investigation of {lab_opportunity_areas}. I am particularly eager to explore research questions at the intersection of your lab's current thrusts.

I have attached my CV for your review. I would welcome the opportunity to discuss how my research background could support your lab's upcoming projects.

Thank you for your time and consideration.

Respectfully,
{user_name}
{user_signature}`
  }
];

export const DEFAULT_EMAIL_TEMPLATE = EMAIL_PRESET_TEMPLATES[0].template;

