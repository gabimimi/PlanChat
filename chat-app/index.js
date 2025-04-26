import { createApp } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

createApp({
  data() {
    return {
      myMessage: "",
      sending: false,
      groupName: "",
      selectedChannel: null,
      editingMessage: null,
      editContent: "",
      newGroupName: "",
      groupNameObjects: [],
      activeMenu: null,
      showGroupInfo: false,
      groupDescription: 'This is a sample group description.',
      groupMembers: ['Alice', 'Bob', 'Charlie'],
    };
  },

  methods: {
    toggleMessageMenu(message) {
      this.activeMenu = this.activeMenu === message ? null : message;
    },
    async sendMessage(session) {
      if (!this.myMessage || !this.selectedChannel) return;
      this.sending = true;
      await this.$graffiti.put(
        {
          value: {
            content: this.myMessage,
            published: Date.now(),
          },
          channels: [this.selectedChannel],
        },
        session
      );
      this.myMessage = "";
      this.sending = false;
      await this.$nextTick();
      this.$refs.messageInput.focus();
    },

    async createGroup(session) {
        const newChannel = crypto.randomUUID();

        // First: create the group
        await this.$graffiti.put(
          {
            value: {
              activity: "Create",
              object: {
                type: "Group Chat",
                name: this.groupName,
                channel: newChannel,
              },
            },
            channels: ["designftw"],
          },
          session
        );
        
        // Then: publish the name-binding object
        await this.$graffiti.put(
          {
            value: {
              name: this.groupName,
              describes: newChannel,
            },
            channels: ["designftw"],
          },
          session
        );
        
        // Optional: immediately select the group
        this.selectedChannel = newChannel;
        this.groupName = "";
    },

    startEdit(message) {
      this.editingMessage = message;
      this.editContent = message.value.content;
    },

    cancelEdit() {
      this.editingMessage = null;
      this.editContent = "";
    },

    async saveEdit(message) {
      await this.$graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/content",
              value: this.editContent,
            },
          ],
        },
        message,
        this.$graffitiSession.value
      );
      this.editingMessage = null;
      this.editContent = "";
    },

    async deleteMessage(message) {
      await this.$graffiti.delete(message, this.$graffitiSession.value);
    },

    async renameGroup() {
      if (!this.newGroupName || !this.selectedChannel) return;
      await this.$graffiti.put(
        {
          value: {
            name: this.newGroupName,
            describes: this.selectedChannel,
          },
          channels: ["designftw"],
        },
        this.$graffitiSession.value
      );
      this.newGroupName = "";
    },

    getGroupName(channel) {
        const matches = this.groupNameObjects
          .filter((obj) => obj.value.describes === channel);
      
        if (matches.length === 0) return null;
      
        // Pick the one with latest timestamp (if present)
        const latest = matches.reduce((a, b) => {
          const aTime = a.value.published ?? a.timestamp ?? 0;
          const bTime = b.value.published ?? b.timestamp ?? 0;
          return aTime > bTime ? a : b;
        });
      
        return latest.value.name;
    },

    updateGroupNameObjects(objs) {
      this.groupNameObjects = objs;
    },

    
    
  },

  mounted() {
    const unwatch = this.$watch(
      () => this.$refs.groupNameDiscover?.$data?.objects,
      (newObjects) => {
        if (newObjects) this.groupNameObjects = newObjects;
      },
      { immediate: true }
    );
    
  },
})
  .use(GraffitiPlugin, {
    graffiti: new GraffitiLocal(),
  })
 .mount("#app");

const toggleMenuBtn = document.getElementById('toggleGroupMenu');
const groupMenu = document.getElementById('groupMenu');
const showCreateFormBtn = document.getElementById('showCreateForm');
const createGroupForm = document.getElementById('createGroupForm');

toggleMenuBtn.addEventListener('click', () => {
  groupMenu.classList.toggle('hidden');
});

showCreateFormBtn.addEventListener('click', () => {
  groupMenu.classList.add('hidden');
  createGroupForm.classList.remove('hidden');
  createGroupForm.classList.remove('showing');
});