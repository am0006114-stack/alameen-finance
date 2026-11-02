import ChatClient from "./ChatClient";
import styles from "./ChatPolish.module.css";

export const metadata = {
  title: "متابعة الطلب | الأمين للأقساط",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return (
    <div className={styles.chatPolish}>
      <ChatClient />
    </div>
  );
}
